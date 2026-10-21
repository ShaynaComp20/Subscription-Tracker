"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BILLING_CYCLES, daysBetween, rollForward, todayISO, type BillingCycle } from "@/lib/dates";
import { formatMoney, monthlyTotalsByCurrency } from "@/lib/money";
import type { Detection, Subscription } from "@/lib/repo";

const CATEGORIES = [
  "Entertainment",
  "Music",
  "Software",
  "Productivity",
  "AI",
  "Cloud Storage",
  "News",
  "Education",
  "Fitness & Health",
  "Gaming",
  "Food",
  "Shopping",
  "Utilities",
  "Other",
];
const CURRENCIES = ["USD", "EUR", "GBP", "INR", "CAD", "AUD", "JPY", "SGD", "AED"];

type FormValues = {
  name: string;
  amount: string;
  currency: string;
  billing_cycle: BillingCycle;
  next_billing_date: string;
  category: string;
  cancel_url: string;
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  if (res.status === 401) {
    window.location.href = "/";
    throw new Error("Signed out");
  }
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `Request failed (${res.status})`);
  return res.status === 204 ? (undefined as T) : res.json();
}

function browserToday(): string {
  return todayISO(Intl.DateTimeFormat().resolvedOptions().timeZone);
}

function whenLabel(days: number): string {
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}

function cancelHref(name: string, url: string | null): string {
  return url || `https://www.google.com/search?q=${encodeURIComponent(`how to cancel ${name} subscription`)}`;
}

/** SQLite stores "YYYY-MM-DD HH:MM:SS" in UTC; the browser sets full ISO strings. */
function formatTimestamp(value: string): string {
  const iso = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  return new Date(iso).toLocaleString();
}

function formatTotals(totals: Record<string, number>, factor = 1): string {
  const entries = Object.entries(totals);
  if (entries.length === 0) return formatMoney(0, "USD");
  return entries.map(([cur, v]) => formatMoney(v * factor, cur)).join(" + ");
}

// --------------------------------------------------------------------------------------------

export default function Dashboard({
  user,
  remindDaysBefore,
}: {
  user: { email: string; name: string | null; lastScanAt: string | null };
  remindDaysBefore: number;
}) {
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [lastScanAt, setLastScanAt] = useState(user.lastScanAt);
  const [scanning, setScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const today = browserToday();
  const autoScanned = useRef(false);

  const loadSubs = useCallback(async () => {
    setSubs((await api<{ subscriptions: Subscription[] }>("/api/subscriptions")).subscriptions);
  }, []);

  const scan = useCallback(async () => {
    setScanning(true);
    setScanMessage("Reading your billing emails from the last year… this can take a minute.");
    try {
      const res = await api<{ scanned: number; detections: Detection[] }>("/api/scan", { method: "POST" });
      setDetections(res.detections);
      setLastScanAt(new Date().toISOString());
      setScanMessage(
        `Checked ${res.scanned} emails and found ${res.detections.length} possible subscription${res.detections.length === 1 ? "" : "s"} to review.`,
      );
    } catch (e) {
      setScanMessage(null);
      setError((e as Error).message);
    } finally {
      setScanning(false);
    }
  }, []);

  useEffect(() => {
    loadSubs().catch((e) => setError(e.message));
    api<{ detections: Detection[] }>("/api/detections")
      .then((r) => setDetections(r.detections))
      .catch((e) => setError(e.message));
    // First visit after signing in: go look for subscriptions straight away.
    if (!user.lastScanAt && !autoScanned.current) {
      autoScanned.current = true;
      scan();
    }
  }, [loadSubs, scan, user.lastScanAt]);

  // Billing dates in the past are shown as their next upcoming occurrence.
  const active = useMemo(
    () =>
      subs
        .filter((s) => s.status === "active")
        .map((s) => ({ ...s, next_billing_date: rollForward(s.next_billing_date, s.billing_cycle, today) }))
        .sort((a, b) => a.next_billing_date.localeCompare(b.next_billing_date)),
    [subs, today],
  );
  const upcoming = active.filter((s) => daysBetween(today, s.next_billing_date) <= 7);
  const monthly = monthlyTotalsByCurrency(active);

  const browserAlerts = useBrowserAlerts(active, today, remindDaysBefore);

  async function addManual(values: FormValues) {
    await api("/api/subscriptions", { method: "POST", body: JSON.stringify(values) });
    setShowAdd(false);
    await loadSubs();
  }

  async function update(id: number, changes: Partial<FormValues> & { status?: string }) {
    await api(`/api/subscriptions/${id}`, { method: "PATCH", body: JSON.stringify(changes) });
    setEditingId(null);
    await loadSubs();
  }

  async function remove(id: number) {
    if (!confirm("Delete this subscription from the tracker?")) return;
    await api(`/api/subscriptions/${id}`, { method: "DELETE" });
    await loadSubs();
  }

  async function resolveDetection(id: number, body: Record<string, unknown>) {
    await api(`/api/detections/${id}`, { method: "POST", body: JSON.stringify(body) });
    setDetections((d) => d.filter((x) => x.id !== id));
    if (body.action === "add") await loadSubs();
  }

  const guard =
    <A extends unknown[]>(fn: (...args: A) => Promise<void>) =>
    async (...args: A) => {
      setError(null);
      try {
        await fn(...args);
      } catch (e) {
        setError((e as Error).message);
      }
    };

  return (
    <div className="container">
      <div className="topbar">
        <div>
          <h1>Subscription Tracker</h1>
          <span className="muted small">{user.email}</span>
        </div>
        <form action="/api/auth/logout" method="post">
          <button className="btn" type="submit">
            Sign out
          </button>
        </form>
      </div>

      {error && (
        <div className="alert">
          <span className="error">{error}</span>{" "}
          <button className="btn link" onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      )}

      {upcoming.length > 0 && (
        <div className="alert">
          <h2>Coming up this week</h2>
          {upcoming.map((s) => {
            const days = daysBetween(today, s.next_billing_date);
            return (
              <div className="alert-row" key={s.id}>
                <span>
                  <strong>{s.name}</strong> will charge you <strong>{formatMoney(s.amount, s.currency)}</strong>{" "}
                  <span className={days <= 1 ? "error" : ""}>{whenLabel(days)}</span>
                </span>
                <span>
                  <a className="btn danger" href={cancelHref(s.name, s.cancel_url)} target="_blank" rel="noreferrer">
                    Cancel it
                  </a>{" "}
                  <button className="btn" onClick={guard(() => update(s.id, { status: "cancelled" }))}>
                    I cancelled it
                  </button>
                </span>
              </div>
            );
          })}
        </div>
      )}

      <div className="metrics">
        <Metric label="Monthly spend" value={formatTotals(monthly)} />
        <Metric label="Yearly spend" value={formatTotals(monthly, 12)} />
        <Metric label="Active subscriptions" value={String(active.length)} />
        <Metric
          label="Next charge"
          value={active[0] ? `${active[0].name}, ${whenLabel(daysBetween(today, active[0].next_billing_date))}` : "—"}
        />
      </div>

      <section className="card">
        <div className="card-head">
          <div>
            <h2>Found in your Gmail</h2>
            <span className="muted small">
              {lastScanAt ? `Last scanned ${formatTimestamp(lastScanAt)}` : "Not scanned yet"}
            </span>
          </div>
          <button className="btn primary" onClick={scan} disabled={scanning}>
            {scanning ? "Scanning…" : lastScanAt ? "Scan again" : "Scan my Gmail"}
          </button>
        </div>
        {scanMessage && <p className="muted">{scanMessage}</p>}
        {detections.length === 0 && !scanning && lastScanAt && <p className="muted">Nothing new to review.</p>}
        {detections.map((d) => (
          <DetectionCard
            key={d.id}
            detection={d}
            today={today}
            onAdd={guard((values: FormValues) => resolveDetection(d.id, { action: "add", ...values }))}
            onIgnore={guard(() => resolveDetection(d.id, { action: "ignore" }))}
          />
        ))}
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Your subscriptions</h2>
          <button className="btn primary" onClick={() => setShowAdd((v) => !v)}>
            {showAdd ? "Close" : "+ Add manually"}
          </button>
        </div>
        {showAdd && <SubscriptionForm submitLabel="Add subscription" onSubmit={guard(addManual)} today={today} />}
        {subs.length === 0 ? (
          <p className="muted">No subscriptions yet. Add one above or review what we found in Gmail.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Price</th>
                  <th>Next charge</th>
                  <th>Category</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {subs.map((s) => {
                  const next = rollForward(s.next_billing_date, s.billing_cycle, today);
                  const days = daysBetween(today, next);
                  if (editingId === s.id) {
                    return (
                      <tr key={s.id}>
                        <td colSpan={5}>
                          <SubscriptionForm
                            initial={{ ...s, next_billing_date: next }}
                            submitLabel="Save"
                            today={today}
                            onSubmit={guard((v: FormValues) => update(s.id, v))}
                            onCancel={() => setEditingId(null)}
                          />
                        </td>
                      </tr>
                    );
                  }
                  return (
                    <tr key={s.id} className={s.status === "cancelled" ? "cancelled" : ""}>
                      <td>
                        <strong>{s.name}</strong>
                        {s.source === "gmail" && <span className="muted small"> · from Gmail</span>}
                        {s.status === "cancelled" && <span className="muted small"> · cancelled</span>}
                      </td>
                      <td>
                        {formatMoney(s.amount, s.currency)} <span className="muted small">/ {s.billing_cycle}</span>
                      </td>
                      <td>
                        {s.status === "active" ? (
                          <>
                            {next} <span className={`badge ${days <= remindDaysBefore ? "soon" : ""}`}>{whenLabel(days)}</span>
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>{s.category}</td>
                      <td className="actions">
                        <a className="btn link" href={cancelHref(s.name, s.cancel_url)} target="_blank" rel="noreferrer">
                          How to cancel
                        </a>
                        <button className="btn link" onClick={() => setEditingId(s.id)}>
                          Edit
                        </button>
                        <button
                          className="btn link"
                          onClick={guard(() => update(s.id, { status: s.status === "active" ? "cancelled" : "active" }))}
                        >
                          {s.status === "active" ? "Mark cancelled" : "Reactivate"}
                        </button>
                        <button className="btn link" onClick={guard(() => remove(s.id))}>
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="muted small">
          We email you {remindDaysBefore === 1 ? "the day" : `${remindDaysBefore} days`} before every charge so you can cancel in time.
          {browserAlerts.canEnable && (
            <>
              {" "}
              <button className="btn link" onClick={browserAlerts.enable}>
                Also alert me in this browser
              </button>
            </>
          )}
        </p>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
    </div>
  );
}

// --------------------------------------------------------------------------------------------

function SubscriptionForm({
  initial,
  submitLabel,
  today,
  onSubmit,
  onCancel,
}: {
  initial?: Partial<{
    name: string;
    amount: number | null;
    currency: string | null;
    billing_cycle: BillingCycle;
    next_billing_date: string;
    category: string;
    cancel_url: string | null;
  }>;
  submitLabel: string;
  today: string;
  onSubmit: (values: FormValues) => Promise<void>;
  onCancel?: () => void;
}) {
  const [values, setValues] = useState<FormValues>({
    name: initial?.name ?? "",
    amount: initial?.amount != null ? String(initial.amount) : "",
    currency: initial?.currency || "USD",
    billing_cycle: initial?.billing_cycle ?? "monthly",
    next_billing_date: initial?.next_billing_date ?? today,
    category: initial?.category ?? "Other",
    cancel_url: initial?.cancel_url ?? "",
  });
  const [saving, setSaving] = useState(false);
  const set = (key: keyof FormValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setValues((v) => ({ ...v, [key]: e.target.value }));

  return (
    <form
      className="grid"
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
          await onSubmit(values);
        } finally {
          setSaving(false);
        }
      }}
    >
      <label>
        Name
        <input required value={values.name} onChange={set("name")} placeholder="Netflix" />
      </label>
      <label>
        Amount
        <input required type="number" min="0" step="0.01" value={values.amount} onChange={set("amount")} placeholder="15.49" />
      </label>
      <label>
        Currency
        <input list="currencies" value={values.currency} onChange={set("currency")} maxLength={3} />
        <datalist id="currencies">
          {CURRENCIES.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </label>
      <label>
        Billed
        <select value={values.billing_cycle} onChange={set("billing_cycle")}>
          {BILLING_CYCLES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>
      <label>
        Next charge
        <input required type="date" value={values.next_billing_date} onChange={set("next_billing_date")} />
      </label>
      <label>
        Category
        <select value={values.category} onChange={set("category")}>
          {CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </label>
      <label style={{ gridColumn: "span 2" }}>
        Cancel link (optional)
        <input type="url" value={values.cancel_url} onChange={set("cancel_url")} placeholder="https://…" />
      </label>
      <div>
        <button className="btn primary" type="submit" disabled={saving}>
          {submitLabel}
        </button>{" "}
        {onCancel && (
          <button className="btn" type="button" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

function DetectionCard({
  detection: d,
  today,
  onAdd,
  onIgnore,
}: {
  detection: Detection;
  today: string;
  onAdd: (values: FormValues) => Promise<void>;
  onIgnore: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(d.amount === null);
  const evidence: { subject: string; date: string }[] = JSON.parse(d.evidence);
  const next = rollForward(d.next_billing_date, d.billing_cycle, today);

  return (
    <div className="detection">
      <div className="row">
        <div>
          <strong>{d.name}</strong>{" "}
          {d.is_trial ? <span className="badge trial">free trial</span> : null}{" "}
          <span className="badge">{Math.round(d.confidence * 100)}% sure</span>
          <div className="muted small">
            {d.amount !== null && d.currency ? formatMoney(d.amount, d.currency) : "Amount unknown"} / {d.billing_cycle} · next
            charge {next} ({whenLabel(daysBetween(today, next))})
          </div>
        </div>
        {!editing && (
          <div>
            <button className="btn primary" onClick={() => onAdd({
              name: d.name,
              amount: String(d.amount),
              currency: d.currency ?? "USD",
              billing_cycle: d.billing_cycle,
              next_billing_date: next,
              category: d.category,
              cancel_url: d.cancel_url ?? "",
            })}>
              Track it
            </button>{" "}
            <button className="btn" onClick={() => setEditing(true)}>
              Edit first
            </button>{" "}
            <button className="btn link" onClick={onIgnore}>
              Not a subscription
            </button>
          </div>
        )}
      </div>
      {editing && (
        <div style={{ marginTop: 10 }}>
          <SubscriptionForm
            initial={{ ...d, next_billing_date: next }}
            submitLabel="Track it"
            today={today}
            onSubmit={onAdd}
            onCancel={d.amount === null ? undefined : () => setEditing(false)}
          />
          {d.amount === null && (
            <button className="btn link" onClick={onIgnore}>
              Not a subscription
            </button>
          )}
        </div>
      )}
      <details>
        <summary>Why we think this is a subscription ({evidence.length} email{evidence.length === 1 ? "" : "s"})</summary>
        <ul>
          {evidence.map((e, i) => (
            <li key={i}>
              {e.date}: {e.subject}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

// --------------------------------------------------------------------------------------------

/** Optional in-browser alert, on top of the reminder email, for charges due within the reminder window. */
function useBrowserAlerts(active: Subscription[], today: string, remindDaysBefore: number) {
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("unsupported");
  useEffect(() => {
    setPermission(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
  }, []);

  useEffect(() => {
    if (permission !== "granted") return;
    for (const s of active) {
      const days = daysBetween(today, s.next_billing_date);
      if (days > remindDaysBefore) continue;
      const key = `notified:${s.id}:${s.next_billing_date}`;
      try {
        if (localStorage.getItem(key)) continue;
        localStorage.setItem(key, "1");
      } catch {
        // Storage blocked: still show the notification.
      }
      new Notification(`${s.name} charges you ${whenLabel(days)}`, {
        body: `${formatMoney(s.amount, s.currency)} on ${s.next_billing_date}. Cancel now if you don't want it.`,
      });
    }
  }, [active, today, remindDaysBefore, permission]);

  return {
    canEnable: permission === "default",
    enable: async () => setPermission(await Notification.requestPermission()),
  };
}
