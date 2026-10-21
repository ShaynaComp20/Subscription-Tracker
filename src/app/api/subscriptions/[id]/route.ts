import { NextResponse } from "next/server";
import { jsonError, parseId, readJson, requireUser } from "@/lib/api";
import { deleteSubscription, getSubscription, updateSubscription } from "@/lib/repo";
import { validateSubscription } from "@/lib/validation";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const id = parseId((await params).id);
  if (!id || !getSubscription(user.id, id)) return jsonError("Subscription not found", 404);
  const result = validateSubscription(await readJson(req), true);
  if (!result.ok) return jsonError(result.error, 400);
  return NextResponse.json({ subscription: updateSubscription(user.id, id, result.value) });
}

export async function DELETE(_req: Request, { params }: Params) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const id = parseId((await params).id);
  if (!id || !deleteSubscription(user.id, id)) return jsonError("Subscription not found", 404);
  return new NextResponse(null, { status: 204 });
}
