import type { BillingCycle } from "./dates";

const MONTHLY_FACTOR: Record<BillingCycle, number> = {
  weekly: 52 / 12,
  monthly: 1,
  quarterly: 1 / 3,
  yearly: 1 / 12,
};

export function monthlyEquivalent(amount: number, cycle: BillingCycle): number {
  return amount * MONTHLY_FACTOR[cycle];
}

/** Sums the monthly-equivalent cost per currency (we never convert between currencies). */
export function monthlyTotalsByCurrency(
  subs: { amount: number; currency: string; billing_cycle: BillingCycle }[],
): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const sub of subs) {
    totals[sub.currency] = (totals[sub.currency] ?? 0) + monthlyEquivalent(sub.amount, sub.billing_cycle);
  }
  return totals;
}

export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}
