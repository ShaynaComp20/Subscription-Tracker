// All billing dates are plain calendar dates stored as "YYYY-MM-DD" strings.
// Math is done in UTC so that daylight-saving shifts never move a date.

export const BILLING_CYCLES = ["weekly", "monthly", "quarterly", "yearly"] as const;
export type BillingCycle = (typeof BILLING_CYCLES)[number];

export function isBillingCycle(value: unknown): value is BillingCycle {
  return typeof value === "string" && (BILLING_CYCLES as readonly string[]).includes(value);
}

export function isISODate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return toISO(parseISO(value)) === value;
}

function parseISO(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function toISO(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Today's date in the given IANA timezone (defaults to the TZ env var, then UTC). */
export function todayISO(timeZone = process.env.TZ || "UTC", now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function dateToISO(date: Date): string {
  return toISO(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())));
}

export function addDays(iso: string, days: number): string {
  const date = parseISO(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return toISO(date);
}

/** Adds months, clamping to the last day of the month (Jan 31 + 1 month = Feb 28/29). */
export function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return toISO(target);
}

export function addCycles(iso: string, cycle: BillingCycle, count: number): string {
  switch (cycle) {
    case "weekly":
      return addDays(iso, 7 * count);
    case "monthly":
      return addMonths(iso, count);
    case "quarterly":
      return addMonths(iso, 3 * count);
    case "yearly":
      return addMonths(iso, 12 * count);
  }
}

/** Whole days from `from` to `to` (positive when `to` is later). */
export function daysBetween(from: string, to: string): number {
  return Math.round((parseISO(to).getTime() - parseISO(from).getTime()) / 86_400_000);
}

/**
 * Moves a billing date that is already in the past forward by whole cycles until it is today or later.
 * Each candidate is computed from the original date so month-end anchors don't drift (Jan 31 -> Feb 28 -> Mar 31).
 */
export function rollForward(iso: string, cycle: BillingCycle, today: string): string {
  if (iso >= today) return iso;
  for (let k = 1; ; k++) {
    const next = addCycles(iso, cycle, k);
    if (next >= today) return next;
  }
}
