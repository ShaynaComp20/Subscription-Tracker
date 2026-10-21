import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { runReminders } from "@/lib/reminders";

export const dynamic = "force-dynamic";

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("authorization") ?? "";
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

/** Call once a day (Vercel Cron, GitHub Actions, crontab + curl, ...). */
export async function GET(req: Request) {
  if (!authorized(req)) return jsonError("Unauthorized", 401);
  return NextResponse.json(await runReminders());
}
