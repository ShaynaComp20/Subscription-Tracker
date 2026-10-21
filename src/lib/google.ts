// Minimal Google OAuth + Gmail REST client (no SDK needed).

import type { RawEmail } from "./parser";
import { saveAccessToken, type User } from "./repo";

const SCOPES = [
  "openid",
  "email",
  "profile",
  // Read receipts/invoices to find subscriptions.
  "https://www.googleapis.com/auth/gmail.readonly",
  // Send the "you'll be charged tomorrow" reminder to the user's own inbox.
  "https://www.googleapis.com/auth/gmail.send",
];

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set (see .env.example)`);
  return value;
}

export function appUrl(): string {
  return (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
}

function redirectUri(): string {
  return `${appUrl()}/api/auth/callback`;
}

export function googleAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: env("GOOGLE_CLIENT_ID"),
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline", // gives us a refresh token so reminders work while the user is away
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
}

async function tokenRequest(params: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env("GOOGLE_CLIENT_ID"),
      client_secret: env("GOOGLE_CLIENT_SECRET"),
      ...params,
    }),
  });
  if (!res.ok) throw new Error(`Google token request failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export function exchangeCode(code: string): Promise<TokenResponse> {
  return tokenRequest({ code, grant_type: "authorization_code", redirect_uri: redirectUri() });
}

export async function fetchProfile(accessToken: string): Promise<{ email: string; name: string | null }> {
  const res = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Could not load Google profile: ${res.status}`);
  const data = await res.json();
  return { email: String(data.email).toLowerCase(), name: data.name ?? null };
}

/** Returns a valid access token, refreshing it with the stored refresh token when needed. */
async function accessToken(user: User): Promise<string> {
  if (user.access_token && user.token_expires_at && user.token_expires_at > Date.now() + 60_000) {
    return user.access_token;
  }
  if (!user.refresh_token) throw new Error("No Google refresh token stored; please sign in again.");
  const tokens = await tokenRequest({ refresh_token: user.refresh_token, grant_type: "refresh_token" });
  const expiresAt = Date.now() + tokens.expires_in * 1000;
  saveAccessToken(user.id, tokens.access_token, expiresAt);
  user.access_token = tokens.access_token;
  user.token_expires_at = expiresAt;
  return tokens.access_token;
}

async function gmail<T>(user: User, path: string, init?: RequestInit): Promise<T> {
  const token = await accessToken(user);
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init?.headers },
    });
    // Back off on rate limits.
    if ((res.status === 429 || res.status >= 500) && attempt < 3) {
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
      continue;
    }
    if (!res.ok) throw new Error(`Gmail API ${path} failed: ${res.status} ${await res.text()}`);
    return res.json();
  }
}

export async function listMessageIds(user: User, query: string, max: number): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({ q: query, maxResults: String(Math.min(500, max - ids.length)) });
    if (pageToken) params.set("pageToken", pageToken);
    const page = await gmail<{ messages?: { id: string }[]; nextPageToken?: string }>(user, `messages?${params}`);
    ids.push(...(page.messages ?? []).map((m) => m.id));
    pageToken = page.nextPageToken;
  } while (pageToken && ids.length < max);
  return ids;
}

interface MessagePart {
  mimeType?: string;
  body?: { data?: string };
  parts?: MessagePart[];
  headers?: { name: string; value: string }[];
}

function decodeBase64Url(data: string): string {
  return Buffer.from(data, "base64url").toString("utf8");
}

function collectBodies(part: MessagePart, out: { plain: string[]; html: string[] }): void {
  if (part.body?.data) {
    if (part.mimeType === "text/plain") out.plain.push(decodeBase64Url(part.body.data));
    else if (part.mimeType === "text/html") out.html.push(decodeBase64Url(part.body.data));
  }
  for (const child of part.parts ?? []) collectBodies(child, out);
}

const ENTITIES: Record<string, string> = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", euro: "€", pound: "£", rsquo: "'", lsquo: "'", ndash: "–", mdash: "—" };

export function htmlToText(html: string): string {
  return html
    .replace(/<(style|script|head)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(br|\/p|\/div|\/tr|\/li|\/h\d)[^>]*>/gi, "\n")
    .replace(/<\/td>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m)
    .replace(/[ \t ]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

export async function getMessage(user: User, id: string): Promise<RawEmail> {
  const msg = await gmail<{ id: string; internalDate: string; snippet?: string; payload: MessagePart }>(
    user,
    `messages/${id}?format=full`,
  );
  const header = (name: string) => msg.payload.headers?.find((h) => h.name.toLowerCase() === name)?.value ?? "";
  const bodies = { plain: [] as string[], html: [] as string[] };
  collectBodies(msg.payload, bodies);
  const body = bodies.plain.length ? bodies.plain.join("\n") : htmlToText(bodies.html.join("\n"));
  return {
    id: msg.id,
    from: header("from"),
    subject: header("subject"),
    date: Number(msg.internalDate),
    // Receipts put the important bits near the top; cap the size to keep parsing fast.
    body: (body || msg.snippet || "").slice(0, 20_000),
  };
}

function encodeHeader(value: string): string {
  return /^[\x20-\x7e]*$/.test(value) ? value : `=?UTF-8?B?${Buffer.from(value).toString("base64")}?=`;
}

/** Sends an email from the user's Gmail account (we only ever send to the user themself). */
export async function sendEmail(user: User, message: { to: string; subject: string; text: string; html: string }): Promise<void> {
  const boundary = `b_${Math.random().toString(36).slice(2)}`;
  const mime = [
    `To: ${message.to}`,
    `Subject: ${encodeHeader(message.subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(message.text).toString("base64"),
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(message.html).toString("base64"),
    `--${boundary}--`,
  ].join("\r\n");
  await gmail(user, "messages/send", {
    method: "POST",
    body: JSON.stringify({ raw: Buffer.from(mime).toString("base64url") }),
  });
}
