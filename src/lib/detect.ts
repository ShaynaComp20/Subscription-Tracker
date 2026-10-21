// Groups email signals by sender and decides which groups look like a real subscription.

import { daysBetween, rollForward, type BillingCycle } from "./dates";
import type { EmailSignal } from "./parser";

export interface DetectedSubscription {
  merchantKey: string;
  name: string;
  amount: number | null;
  currency: string | null;
  billingCycle: BillingCycle;
  nextBillingDate: string;
  category: string;
  cancelUrl: string | null;
  isTrial: boolean;
  /** 0..1 — how sure we are this is a recurring charge. */
  confidence: number;
  evidence: { subject: string; date: string; amount: number | null; currency: string | null }[];
}

/** Minimum per-email wording score for an email to count as subscription-related. */
const MIN_EMAIL_SCORE = 3;
const MIN_CONFIDENCE = 0.5;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Infers the billing cycle from the typical gap between charges. */
export function cycleFromGaps(dates: string[]): BillingCycle | null {
  const unique = [...new Set(dates)].sort();
  if (unique.length < 2) return null;
  const gaps = unique.slice(1).map((d, i) => daysBetween(unique[i], d));
  const gap = median(gaps);
  if (gap >= 5 && gap <= 9) return "weekly";
  if (gap >= 26 && gap <= 35) return "monthly";
  if (gap >= 80 && gap <= 100) return "quarterly";
  if (gap >= 340 && gap <= 390) return "yearly";
  return null;
}

function mostCommon<T>(values: T[]): T | null {
  const counts = new Map<T, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: T | null = null;
  let bestCount = 0;
  for (const [v, c] of counts) if (c > bestCount) [best, bestCount] = [v, c];
  return best;
}

export function detectSubscriptions(signals: EmailSignal[], today: string): DetectedSubscription[] {
  const groups = new Map<string, EmailSignal[]>();
  for (const s of signals) {
    if (s.score < MIN_EMAIL_SCORE) continue;
    const list = groups.get(s.merchantKey) ?? [];
    list.push(s);
    groups.set(s.merchantKey, list);
  }

  const results: DetectedSubscription[] = [];
  for (const [merchantKey, emails] of groups) {
    emails.sort((a, b) => a.date.localeCompare(b.date));
    const latest = emails[emails.length - 1];
    const charges = emails.filter((e) => e.amount !== null);
    const latestCharge = charges[charges.length - 1] ?? null;
    const merchant = emails.find((e) => e.merchant)?.merchant ?? null;

    const hintedCycle = mostCommon(emails.map((e) => e.cycleHint).filter((c): c is BillingCycle => c !== null));
    const gapCycle = cycleFromGaps(charges.map((e) => e.date));
    const cycle = hintedCycle ?? gapCycle;

    let confidence = 0;
    if (merchant) confidence += 0.3;
    if (cycle) confidence += 0.25;
    if (gapCycle) confidence += 0.2;
    if (latestCharge) confidence += 0.15;
    if (emails.some((e) => e.nextBillingDate)) confidence += 0.15;
    if (Math.max(...emails.map((e) => e.score)) >= 6) confidence += 0.1;
    confidence = Math.min(1, Math.round(confidence * 100) / 100);
    // Unknown senders with no amount are almost always noise (newsletters, notices).
    if (confidence < MIN_CONFIDENCE || (!merchant && !latestCharge)) continue;

    const billingCycle = cycle ?? "monthly";
    // An explicit upcoming date ("renews on ...") beats a calculated one.
    const explicit = emails
      .map((e) => e.nextBillingDate)
      .filter((d): d is string => d !== null && d >= today)
      .sort()[0];
    const lastSeen = latestCharge?.date ?? latest.date;
    const nextBillingDate = explicit ?? rollForward(lastSeen, billingCycle, today);

    // Subscriptions that stopped emailing more than two cycles ago were probably cancelled.
    const staleAfterDays = { weekly: 21, monthly: 70, quarterly: 200, yearly: 400 }[billingCycle];
    if (!explicit && daysBetween(lastSeen, today) > staleAfterDays) continue;

    results.push({
      merchantKey,
      name: merchant?.name ?? latest.merchantName,
      amount: latestCharge?.amount ?? null,
      currency: latestCharge?.currency ?? null,
      billingCycle,
      nextBillingDate,
      category: merchant?.category ?? "Other",
      cancelUrl: merchant?.cancelUrl ?? null,
      isTrial: latest.isTrial,
      confidence,
      evidence: emails
        .slice(-5)
        .reverse()
        .map((e) => ({ subject: e.subject, date: e.date, amount: e.amount, currency: e.currency })),
    });
  }

  return results.sort((a, b) => b.confidence - a.confidence || a.nextBillingDate.localeCompare(b.nextBillingDate));
}
