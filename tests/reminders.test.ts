import { describe, expect, it } from "vitest";
import { buildReminderEmail, planReminders } from "@/lib/reminders";
import type { Subscription } from "@/lib/repo";

function sub(partial: Partial<Subscription>): Subscription {
  return {
    id: 1,
    user_id: 1,
    name: "Netflix",
    amount: 15.49,
    currency: "USD",
    billing_cycle: "monthly",
    next_billing_date: "2026-10-22",
    category: "Entertainment",
    cancel_url: "https://www.netflix.com/cancelplan",
    notes: null,
    source: "manual",
    status: "active",
    last_reminded_for: null,
    created_at: "",
    ...partial,
  };
}

describe("planReminders", () => {
  const today = "2026-10-21";

  it("warns the day before a charge, once", () => {
    expect(planReminders([sub({})], today, 1).due).toHaveLength(1);
    expect(planReminders([sub({ last_reminded_for: "2026-10-22" })], today, 1).due).toHaveLength(0);
  });

  it("does not warn too early", () => {
    expect(planReminders([sub({ next_billing_date: "2026-10-25" })], today, 1).due).toHaveLength(0);
  });

  it("still warns on the day if yesterday's run was missed", () => {
    const { due } = planReminders([sub({ next_billing_date: today })], today, 1);
    expect(due[0]).toMatchObject({ daysUntil: 0, chargeDate: today });
  });

  it("rolls past charges forward to the next cycle", () => {
    const { rolled, due } = planReminders([sub({ next_billing_date: "2026-09-22" })], today, 1);
    expect(rolled).toEqual([{ id: 1, date: "2026-10-22" }]);
    expect(due[0].chargeDate).toBe("2026-10-22");
  });

  it("skips cancelled subscriptions", () => {
    expect(planReminders([sub({ status: "cancelled" })], today, 1).due).toHaveLength(0);
  });
});

describe("buildReminderEmail", () => {
  it("says what will be charged tomorrow with a cancel link", () => {
    const email = buildReminderEmail([{ sub: sub({}), chargeDate: "2026-10-22", daysUntil: 1 }]);
    expect(email.subject).toBe("Heads up: Netflix will charge you $15.49 tomorrow");
    expect(email.text).toContain("https://www.netflix.com/cancelplan");
    expect(email.html).toContain("Cancel it");
  });

  it("falls back to a search link and escapes names", () => {
    const email = buildReminderEmail([
      { sub: sub({ name: "<b>Gym</b>", cancel_url: null, currency: "INR", amount: 999 }), chargeDate: "2026-10-22", daysUntil: 1 },
      { sub: sub({ id: 2 }), chargeDate: "2026-10-22", daysUntil: 1 },
    ]);
    expect(email.subject).toBe("Heads up: 2 subscriptions will charge you soon");
    expect(email.html).toContain("&lt;b&gt;Gym&lt;/b&gt;");
    expect(email.html).toContain("https://www.google.com/search?q=how%20to%20cancel");
  });
});
