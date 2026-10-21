import { daysBetween, rollForward, todayISO } from "./dates";
import { appUrl, sendEmail } from "./google";
import { formatMoney } from "./money";
import { listActiveSubscriptions, listUsers, markReminded, setNextBillingDate, type Subscription, type User } from "./repo";

export interface DueCharge {
  sub: Subscription;
  chargeDate: string;
  daysUntil: number;
}

export function remindDaysBefore(): number {
  const n = Number(process.env.REMIND_DAYS_BEFORE ?? 1);
  return Number.isInteger(n) && n >= 0 ? n : 1;
}

/**
 * Works out, for one user's active subscriptions:
 *  - which billing dates have passed and must move forward to the next cycle, and
 *  - which charges are close enough to warn about and haven't been warned about yet.
 * Charges due today are included too, so a missed daily run still sends the warning.
 */
export function planReminders(subs: Subscription[], today: string, daysBefore: number) {
  const rolled: { id: number; date: string }[] = [];
  const due: DueCharge[] = [];
  for (const sub of subs) {
    if (sub.status !== "active") continue;
    const chargeDate = rollForward(sub.next_billing_date, sub.billing_cycle, today);
    if (chargeDate !== sub.next_billing_date) rolled.push({ id: sub.id, date: chargeDate });
    const daysUntil = daysBetween(today, chargeDate);
    if (daysUntil <= daysBefore && sub.last_reminded_for !== chargeDate) {
      due.push({ sub: { ...sub, next_billing_date: chargeDate }, chargeDate, daysUntil });
    }
  }
  return { rolled, due };
}

function when(daysUntil: number): string {
  if (daysUntil === 0) return "today";
  if (daysUntil === 1) return "tomorrow";
  return `in ${daysUntil} days`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function cancelLink(sub: Subscription): string {
  return sub.cancel_url || `https://www.google.com/search?q=${encodeURIComponent(`how to cancel ${sub.name} subscription`)}`;
}

export function buildReminderEmail(due: DueCharge[]): { subject: string; text: string; html: string } {
  const first = due[0];
  const subject =
    due.length === 1
      ? `Heads up: ${first.sub.name} will charge you ${formatMoney(first.sub.amount, first.sub.currency)} ${when(first.daysUntil)}`
      : `Heads up: ${due.length} subscriptions will charge you soon`;

  const text = [
    "These subscriptions are about to renew. If you don't want them anymore, cancel now to avoid the charge.",
    "",
    ...due.map(
      (d) =>
        `- ${d.sub.name}: ${formatMoney(d.sub.amount, d.sub.currency)} ${when(d.daysUntil)} (${d.chargeDate})\n  Cancel: ${cancelLink(d.sub)}`,
    ),
    "",
    `Manage your subscriptions: ${appUrl()}`,
  ].join("\n");

  const rows = due
    .map(
      (d) => `
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #eee">
          <strong>${escapeHtml(d.sub.name)}</strong><br>
          <span style="color:#555">${escapeHtml(formatMoney(d.sub.amount, d.sub.currency))} will be charged <strong>${when(d.daysUntil)}</strong> (${d.chargeDate})</span>
        </td>
        <td style="padding:12px 0;border-bottom:1px solid #eee;text-align:right">
          <a href="${escapeHtml(cancelLink(d.sub))}" style="background:#d93025;color:#fff;padding:8px 14px;border-radius:6px;text-decoration:none">Cancel it</a>
        </td>
      </tr>`,
    )
    .join("");

  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:auto;color:#222">
    <h2 style="margin-bottom:4px">Upcoming subscription charge${due.length > 1 ? "s" : ""}</h2>
    <p style="color:#555;margin-top:0">If you don't want to keep paying, cancel before the charge goes through.</p>
    <table style="width:100%;border-collapse:collapse">${rows}</table>
    <p style="margin-top:24px"><a href="${escapeHtml(appUrl())}">Open Subscription Tracker</a> to edit or mark these as cancelled.</p>
  </div>`;

  return { subject, text, html };
}

async function remindUser(user: User, today: string, daysBefore: number): Promise<number> {
  const { rolled, due } = planReminders(listActiveSubscriptions(user.id), today, daysBefore);
  for (const r of rolled) setNextBillingDate(r.id, r.date);
  if (due.length === 0) return 0;
  await sendEmail(user, { to: user.email, ...buildReminderEmail(due) });
  for (const d of due) markReminded(d.sub.id, d.chargeDate);
  return due.length;
}

/** Run once a day: rolls past billing dates forward and emails users about upcoming charges. */
export async function runReminders(today = todayISO()): Promise<{ users: number; reminders: number; errors: string[] }> {
  const daysBefore = remindDaysBefore();
  let reminders = 0;
  const errors: string[] = [];
  const users = listUsers().filter((u) => u.refresh_token);
  for (const user of users) {
    try {
      reminders += await remindUser(user, today, daysBefore);
    } catch (err) {
      errors.push(`${user.email}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { users: users.length, reminders, errors };
}
