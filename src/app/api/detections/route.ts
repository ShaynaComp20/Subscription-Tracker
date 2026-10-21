import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api";
import { listPendingDetections } from "@/lib/repo";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  return NextResponse.json({ detections: listPendingDetections(user.id), lastScanAt: user.last_scan_at });
}
