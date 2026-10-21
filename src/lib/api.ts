import { NextResponse } from "next/server";
import { getCurrentUser } from "./session";
import type { User } from "./repo";

export function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

/** Returns the signed-in user, or a 401 response to send back. */
export async function requireUser(): Promise<User | NextResponse> {
  const user = await getCurrentUser();
  return user ?? jsonError("Not signed in", 401);
}

export function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}
