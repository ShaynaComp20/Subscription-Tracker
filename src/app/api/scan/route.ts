import { NextResponse } from "next/server";
import { jsonError, requireUser } from "@/lib/api";
import { listPendingDetections } from "@/lib/repo";
import { scanGmail } from "@/lib/scan";

export const dynamic = "force-dynamic";
// Reading a few hundred emails can take a while.
export const maxDuration = 300;

export async function POST() {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  try {
    const { scanned } = await scanGmail(user);
    return NextResponse.json({ scanned, detections: listPendingDetections(user.id) });
  } catch (err) {
    console.error("Gmail scan failed", err);
    return jsonError("Couldn't read your Gmail. Try signing out and in again.", 502);
  }
}
