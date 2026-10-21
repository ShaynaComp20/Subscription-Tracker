import crypto from "node:crypto";
import { cookies } from "next/headers";
import { getUser, type User } from "./repo";

const COOKIE = "st_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) throw new Error("SESSION_SECRET must be set to a long random string");
  return s;
}

function sign(value: string): string {
  return crypto.createHmac("sha256", secret()).update(value).digest("base64url");
}

export function createSessionValue(userId: number): string {
  const payload = `${userId}.${Date.now() + MAX_AGE_SECONDS * 1000}`;
  return `${payload}.${sign(payload)}`;
}

export function readSessionValue(value: string | undefined): number | null {
  if (!value) return null;
  const [id, expires, signature] = value.split(".");
  if (!id || !expires || !signature) return null;
  const expected = sign(`${id}.${expires}`);
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  if (Number(expires) < Date.now()) return null;
  return Number(id);
}

export const sessionCookie = {
  name: COOKIE,
  options: {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  },
};

export async function getCurrentUser(): Promise<User | null> {
  const store = await cookies();
  const userId = readSessionValue(store.get(COOKIE)?.value);
  return userId ? getUser(userId) : null;
}
