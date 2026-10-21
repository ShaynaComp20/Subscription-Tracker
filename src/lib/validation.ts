import { isBillingCycle, isISODate } from "./dates";
import type { SubscriptionInput } from "./repo";

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

function optionalString(v: unknown, max: number): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  return typeof v === "string" ? v.trim().slice(0, max) : undefined;
}

/**
 * Validates a subscription body. With `partial` (PATCH), missing fields are allowed and only the
 * provided ones are returned.
 */
export function validateSubscription(body: unknown, partial = false): Result<Partial<SubscriptionInput> & { status?: "active" | "cancelled" }> {
  if (!body || typeof body !== "object") return { ok: false, error: "Body must be a JSON object" };
  const b = body as Record<string, unknown>;
  const out: Partial<SubscriptionInput> & { status?: "active" | "cancelled" } = {};

  const required = (key: string) => !partial && (b[key] === undefined || b[key] === "");

  if (required("name")) return { ok: false, error: "Name is required" };
  if (b.name !== undefined) {
    if (typeof b.name !== "string" || !b.name.trim()) return { ok: false, error: "Name is required" };
    out.name = b.name.trim().slice(0, 100);
  }

  if (required("amount")) return { ok: false, error: "Amount is required" };
  if (b.amount !== undefined) {
    const amount = Number(b.amount);
    if (!Number.isFinite(amount) || amount < 0) return { ok: false, error: "Amount must be a positive number" };
    out.amount = Math.round(amount * 100) / 100;
  }

  if (b.currency !== undefined || !partial) {
    const currency = typeof b.currency === "string" && b.currency ? b.currency.trim().toUpperCase() : "USD";
    if (!/^[A-Z]{3}$/.test(currency)) return { ok: false, error: "Currency must be a 3-letter code like USD or INR" };
    out.currency = currency;
  }

  if (b.billing_cycle !== undefined || !partial) {
    if (!isBillingCycle(b.billing_cycle)) return { ok: false, error: "Billing cycle must be weekly, monthly, quarterly or yearly" };
    out.billing_cycle = b.billing_cycle;
  }

  if (b.next_billing_date !== undefined || !partial) {
    if (!isISODate(b.next_billing_date)) return { ok: false, error: "Next billing date must be a valid date (YYYY-MM-DD)" };
    out.next_billing_date = b.next_billing_date;
  }

  if (b.category !== undefined || !partial) {
    out.category = optionalString(b.category, 50) || "Other";
  }

  const cancelUrl = optionalString(b.cancel_url, 500);
  if (cancelUrl && !/^https?:\/\//i.test(cancelUrl)) return { ok: false, error: "Cancel link must start with http:// or https://" };
  if (cancelUrl !== undefined || !partial) out.cancel_url = cancelUrl ?? null;

  const notes = optionalString(b.notes, 1000);
  if (notes !== undefined || !partial) out.notes = notes ?? null;

  if (b.status !== undefined) {
    if (b.status !== "active" && b.status !== "cancelled") return { ok: false, error: "Status must be active or cancelled" };
    out.status = b.status;
  }

  return { ok: true, value: out };
}
