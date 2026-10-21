import { NextResponse, type NextRequest } from "next/server";
import { appUrl, exchangeCode, fetchProfile } from "@/lib/google";
import { upsertUser } from "@/lib/repo";
import { createSessionValue, sessionCookie } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const expected = req.cookies.get("st_oauth_state")?.value;
  if (req.nextUrl.searchParams.get("error") || !code || !state || state !== expected) {
    return NextResponse.redirect(`${appUrl()}/?error=signin`);
  }

  const tokens = await exchangeCode(code);
  if (!tokens.scope?.includes("gmail.readonly")) {
    // The user unticked the Gmail permission on Google's consent screen.
    return NextResponse.redirect(`${appUrl()}/?error=gmail_permission`);
  }
  const profile = await fetchProfile(tokens.access_token);
  const user = upsertUser({
    email: profile.email,
    name: profile.name,
    accessToken: tokens.access_token,
    expiresAt: Date.now() + tokens.expires_in * 1000,
    refreshToken: tokens.refresh_token ?? null,
  });

  const res = NextResponse.redirect(appUrl());
  res.cookies.set(sessionCookie.name, createSessionValue(user.id), sessionCookie.options);
  res.cookies.delete("st_oauth_state");
  return res;
}
