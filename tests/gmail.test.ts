// Runs the full scan + reminder flow against a fake Gmail API.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "subtracker-gmail-"));
process.env.DATABASE_PATH = path.join(dir, "test.db");
process.env.GOOGLE_CLIENT_ID = "id";
process.env.GOOGLE_CLIENT_SECRET = "secret";
process.env.APP_URL = "https://tracker.example";

const repo = await import("@/lib/repo");
const { scanGmail } = await import("@/lib/scan");
const { runReminders } = await import("@/lib/reminders");
const { htmlToText } = await import("@/lib/google");

const b64 = (s: string) => Buffer.from(s).toString("base64url");

const MESSAGES: Record<string, { from: string; subject: string; date: string; html?: string; text?: string }> = {
  n1: { from: "Netflix <info@account.netflix.com>", subject: "Your Netflix membership", date: "2026-08-05", text: "Total charged: $15.49 monthly membership" },
  n2: { from: "Netflix <info@account.netflix.com>", subject: "Your Netflix membership", date: "2026-09-05", text: "Total charged: $15.49 monthly membership" },
  n3: {
    from: "Netflix <info@account.netflix.com>",
    subject: "Your Netflix membership",
    date: "2026-10-05",
    html: "<html><head><style>p{}</style></head><body><p>Total charged:&nbsp;&#36;15.49</p><p>Your membership renews on November 5, 2026.</p></body></html>",
  },
  x1: { from: "Store <orders@shop.example>", subject: "Your order has shipped", date: "2026-10-01", text: "Order total $40.00" },
};

function fakeGoogle(sent: string[]) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const json = (data: unknown) => new Response(JSON.stringify(data), { status: 200 });
    if (url.startsWith("https://oauth2.googleapis.com/token")) return json({ access_token: "fresh", expires_in: 3600 });
    const u = new URL(url);
    if (u.pathname.endsWith("/messages") && init?.method !== "POST") {
      expect(u.searchParams.get("q")).toContain("newer_than:1y");
      return json({ messages: Object.keys(MESSAGES).map((id) => ({ id })) });
    }
    if (u.pathname.endsWith("/messages/send")) {
      sent.push(Buffer.from(JSON.parse(String(init?.body)).raw, "base64url").toString("utf8"));
      return json({ id: "sent" });
    }
    const id = u.pathname.split("/").pop()!;
    const m = MESSAGES[id];
    return json({
      id,
      internalDate: String(Date.parse(`${m.date}T10:00:00Z`)),
      payload: {
        mimeType: "multipart/alternative",
        headers: [
          { name: "From", value: m.from },
          { name: "Subject", value: m.subject },
        ],
        parts: [m.text ? { mimeType: "text/plain", body: { data: b64(m.text) } } : { mimeType: "text/html", body: { data: b64(m.html!) } }],
      },
    });
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("Gmail scan and reminders", () => {
  it("finds Netflix, skips the one-off order, and emails a reminder the day before", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-21T09:00:00Z"));
    const sent: string[] = [];
    vi.stubGlobal("fetch", fakeGoogle(sent));

    // Expired access token forces a refresh-token exchange.
    const user = repo.upsertUser({ email: "me@gmail.com", name: "Me", accessToken: "old", expiresAt: 0, refreshToken: "refresh" });
    const { scanned, detected } = await scanGmail(user);
    expect(scanned).toBe(4);
    expect(detected).toHaveLength(1);
    expect(detected[0]).toMatchObject({ name: "Netflix", amount: 15.49, billingCycle: "monthly", nextBillingDate: "2026-11-05" });
    expect(repo.getUser(user.id)?.access_token).toBe("fresh");

    // User confirms it.
    const [pending] = repo.listPendingDetections(user.id);
    const sub = repo.createSubscription(
      user.id,
      { name: pending.name, amount: pending.amount!, currency: pending.currency!, billing_cycle: pending.billing_cycle, next_billing_date: pending.next_billing_date, category: pending.category, cancel_url: pending.cancel_url, notes: null },
      "gmail",
    );

    // Two days before: nothing yet.
    expect((await runReminders("2026-11-03")).reminders).toBe(0);
    // The day before: one email.
    expect(await runReminders("2026-11-04")).toEqual({ users: 1, reminders: 1, errors: [] });
    // Running again the same day doesn't send a duplicate.
    expect((await runReminders("2026-11-04")).reminders).toBe(0);

    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain("To: me@gmail.com");
    expect(sent[0]).toContain("Subject: Heads up: Netflix will charge you $15.49 tomorrow");
    const textPart = sent[0].split("\r\n\r\n")[2].split("\r\n")[0];
    expect(Buffer.from(textPart, "base64").toString()).toContain("https://www.netflix.com/cancelplan");

    // After the charge date passes, the next charge moves to December and gets its own reminder.
    expect((await runReminders("2026-12-04")).reminders).toBe(1);
    expect(repo.getSubscription(user.id, sub.id)?.next_billing_date).toBe("2026-12-05");
    vi.useRealTimers();
  });

  it("turns receipt HTML into readable text", () => {
    expect(htmlToText("<style>x</style><p>Total:&nbsp;&#8377;199</p><p>Thanks</p>")).toBe("Total: ₹199\nThanks");
  });
});
