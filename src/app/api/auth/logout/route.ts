import { NextResponse } from "next/server";
import { appUrl } from "@/lib/google";
import { sessionCookie } from "@/lib/session";

export async function POST() {
  const res = NextResponse.redirect(appUrl(), 303);
  res.cookies.delete(sessionCookie.name);
  return res;
}
