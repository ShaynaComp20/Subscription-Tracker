import { getDb } from "./db";
import type { BillingCycle } from "./dates";
import type { DetectedSubscription } from "./detect";

export interface User {
  id: number;
  email: string;
  name: string | null;
  refresh_token: string | null;
  access_token: string | null;
  token_expires_at: number | null;
  last_scan_at: string | null;
}

export interface Subscription {
  id: number;
  user_id: number;
  name: string;
  amount: number;
  currency: string;
  billing_cycle: BillingCycle;
  next_billing_date: string;
  category: string;
  cancel_url: string | null;
  notes: string | null;
  source: "manual" | "gmail";
  status: "active" | "cancelled";
  last_reminded_for: string | null;
  created_at: string;
}

export type SubscriptionInput = Pick<
  Subscription,
  "name" | "amount" | "currency" | "billing_cycle" | "next_billing_date" | "category" | "cancel_url" | "notes"
>;

export interface Detection {
  id: number;
  user_id: number;
  merchant_key: string;
  name: string;
  amount: number | null;
  currency: string | null;
  billing_cycle: BillingCycle;
  next_billing_date: string;
  category: string;
  cancel_url: string | null;
  is_trial: number;
  confidence: number;
  evidence: string;
  status: "pending" | "added" | "ignored";
}

// Rows from node:sqlite have a null prototype; copy them into plain objects.
function plain<T>(row: unknown): T {
  return { ...(row as object) } as T;
}

// --- users ---

export function upsertUser(input: {
  email: string;
  name: string | null;
  accessToken: string;
  expiresAt: number;
  refreshToken: string | null;
}): User {
  const db = getDb();
  db.prepare(
    `INSERT INTO users (email, name, access_token, token_expires_at, refresh_token)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(email) DO UPDATE SET
       name = excluded.name,
       access_token = excluded.access_token,
       token_expires_at = excluded.token_expires_at,
       -- Google only returns a refresh token on first consent; keep the old one otherwise.
       refresh_token = COALESCE(excluded.refresh_token, users.refresh_token)`,
  ).run(input.email, input.name, input.accessToken, input.expiresAt, input.refreshToken);
  return plain<User>(db.prepare("SELECT * FROM users WHERE email = ?").get(input.email));
}

export function getUser(id: number): User | null {
  const row = getDb().prepare("SELECT * FROM users WHERE id = ?").get(id);
  return row ? plain<User>(row) : null;
}

export function listUsers(): User[] {
  return getDb().prepare("SELECT * FROM users").all().map((r) => plain<User>(r));
}

export function saveAccessToken(userId: number, accessToken: string, expiresAt: number): void {
  getDb().prepare("UPDATE users SET access_token = ?, token_expires_at = ? WHERE id = ?").run(accessToken, expiresAt, userId);
}

export function markScanned(userId: number): void {
  getDb().prepare("UPDATE users SET last_scan_at = datetime('now') WHERE id = ?").run(userId);
}

// --- subscriptions ---

export function listSubscriptions(userId: number): Subscription[] {
  return getDb()
    .prepare("SELECT * FROM subscriptions WHERE user_id = ? ORDER BY status, next_billing_date")
    .all(userId)
    .map((r) => plain<Subscription>(r));
}

export function getSubscription(userId: number, id: number): Subscription | null {
  const row = getDb().prepare("SELECT * FROM subscriptions WHERE id = ? AND user_id = ?").get(id, userId);
  return row ? plain<Subscription>(row) : null;
}

export function createSubscription(userId: number, input: SubscriptionInput, source: "manual" | "gmail"): Subscription {
  const result = getDb()
    .prepare(
      `INSERT INTO subscriptions (user_id, name, amount, currency, billing_cycle, next_billing_date, category, cancel_url, notes, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      userId,
      input.name,
      input.amount,
      input.currency,
      input.billing_cycle,
      input.next_billing_date,
      input.category,
      input.cancel_url,
      input.notes,
      source,
    );
  return getSubscription(userId, Number(result.lastInsertRowid))!;
}

const UPDATABLE = ["name", "amount", "currency", "billing_cycle", "next_billing_date", "category", "cancel_url", "notes", "status"] as const;
type SubscriptionUpdate = Partial<Pick<Subscription, (typeof UPDATABLE)[number]>>;

export function updateSubscription(userId: number, id: number, changes: SubscriptionUpdate): Subscription | null {
  const keys = UPDATABLE.filter((k) => changes[k] !== undefined);
  if (keys.length > 0) {
    const values = keys.map((k) => changes[k] ?? null);
    getDb()
      .prepare(`UPDATE subscriptions SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE id = ? AND user_id = ?`)
      .run(...values, id, userId);
  }
  return getSubscription(userId, id);
}

export function deleteSubscription(userId: number, id: number): boolean {
  return getDb().prepare("DELETE FROM subscriptions WHERE id = ? AND user_id = ?").run(id, userId).changes > 0;
}

export function listActiveSubscriptions(userId: number): Subscription[] {
  return listSubscriptions(userId).filter((s) => s.status === "active");
}

export function setNextBillingDate(id: number, date: string): void {
  getDb().prepare("UPDATE subscriptions SET next_billing_date = ? WHERE id = ?").run(date, id);
}

export function markReminded(id: number, billingDate: string): void {
  getDb().prepare("UPDATE subscriptions SET last_reminded_for = ? WHERE id = ?").run(billingDate, id);
}

// --- detections ---

/** Saves scan results. Detections the user already added or ignored are left alone. */
export function saveDetections(userId: number, detected: DetectedSubscription[]): void {
  const stmt = getDb().prepare(
    `INSERT INTO detections (user_id, merchant_key, name, amount, currency, billing_cycle, next_billing_date, category, cancel_url, is_trial, confidence, evidence)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, merchant_key) DO UPDATE SET
       name = excluded.name, amount = excluded.amount, currency = excluded.currency,
       billing_cycle = excluded.billing_cycle, next_billing_date = excluded.next_billing_date,
       category = excluded.category, cancel_url = excluded.cancel_url, is_trial = excluded.is_trial,
       confidence = excluded.confidence, evidence = excluded.evidence, updated_at = datetime('now')
     WHERE detections.status = 'pending'`,
  );
  for (const d of detected) {
    stmt.run(
      userId,
      d.merchantKey,
      d.name,
      d.amount,
      d.currency,
      d.billingCycle,
      d.nextBillingDate,
      d.category,
      d.cancelUrl,
      d.isTrial ? 1 : 0,
      d.confidence,
      JSON.stringify(d.evidence),
    );
  }
}

export function listPendingDetections(userId: number): Detection[] {
  return getDb()
    .prepare("SELECT * FROM detections WHERE user_id = ? AND status = 'pending' ORDER BY confidence DESC, next_billing_date")
    .all(userId)
    .map((r) => plain<Detection>(r));
}

export function getDetection(userId: number, id: number): Detection | null {
  const row = getDb().prepare("SELECT * FROM detections WHERE id = ? AND user_id = ?").get(id, userId);
  return row ? plain<Detection>(row) : null;
}

export function setDetectionStatus(userId: number, id: number, status: "added" | "ignored"): void {
  getDb().prepare("UPDATE detections SET status = ? WHERE id = ? AND user_id = ?").run(status, id, userId);
}
