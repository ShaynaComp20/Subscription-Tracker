import { NextResponse } from "next/server";
import { jsonError, parseId, readJson, requireUser } from "@/lib/api";
import { createSubscription, getDetection, setDetectionStatus, type SubscriptionInput } from "@/lib/repo";
import { validateSubscription } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * POST { action: "ignore" }                     -> hide this detection for good
 * POST { action: "add", ...subscription fields } -> turn it into a tracked subscription
 *   (fields the user edited in the UI override what we detected)
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const id = parseId((await params).id);
  const detection = id ? getDetection(user.id, id) : null;
  if (!detection || detection.status !== "pending") return jsonError("Suggestion not found", 404);

  const body = ((await readJson(req)) ?? {}) as Record<string, unknown>;
  if (body.action === "ignore") {
    setDetectionStatus(user.id, detection.id, "ignored");
    return NextResponse.json({ ok: true });
  }
  if (body.action !== "add") return jsonError('action must be "add" or "ignore"', 400);

  const result = validateSubscription({
    name: detection.name,
    amount: detection.amount ?? undefined,
    currency: detection.currency ?? undefined,
    billing_cycle: detection.billing_cycle,
    next_billing_date: detection.next_billing_date,
    category: detection.category,
    cancel_url: detection.cancel_url,
    notes: detection.is_trial ? "Free trial detected in Gmail - it will start charging on the next billing date." : null,
    ...Object.fromEntries(Object.entries(body).filter(([k]) => k !== "action")),
  });
  if (!result.ok) return jsonError(result.error, 400);

  const subscription = createSubscription(user.id, result.value as SubscriptionInput, "gmail");
  setDetectionStatus(user.id, detection.id, "added");
  return NextResponse.json({ subscription }, { status: 201 });
}
