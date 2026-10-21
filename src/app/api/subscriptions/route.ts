import { NextResponse } from "next/server";
import { jsonError, readJson, requireUser } from "@/lib/api";
import { createSubscription, listSubscriptions, type SubscriptionInput } from "@/lib/repo";
import { validateSubscription } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  return NextResponse.json({ subscriptions: listSubscriptions(user.id) });
}

export async function POST(req: Request) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const result = validateSubscription(await readJson(req));
  if (!result.ok) return jsonError(result.error, 400);
  const sub = createSubscription(user.id, result.value as SubscriptionInput, "manual");
  return NextResponse.json({ subscription: sub }, { status: 201 });
}
