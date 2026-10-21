import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "subtracker-"));
process.env.DATABASE_PATH = path.join(dir, "test.db");

const repo = await import("@/lib/repo");
const { validateSubscription } = await import("@/lib/validation");

describe("repository", () => {
  let userId: number;
  beforeAll(() => {
    userId = repo.upsertUser({ email: "a@example.com", name: "A", accessToken: "t", expiresAt: 1, refreshToken: "r" }).id;
  });

  it("keeps the refresh token when Google doesn't send a new one", () => {
    const again = repo.upsertUser({ email: "a@example.com", name: "A", accessToken: "t2", expiresAt: 2, refreshToken: null });
    expect(again.id).toBe(userId);
    expect(again.refresh_token).toBe("r");
  });

  it("creates, updates and deletes subscriptions scoped to the user", () => {
    const sub = repo.createSubscription(
      userId,
      { name: "Netflix", amount: 15.49, currency: "USD", billing_cycle: "monthly", next_billing_date: "2026-11-01", category: "Entertainment", cancel_url: null, notes: null },
      "manual",
    );
    expect(repo.updateSubscription(userId, sub.id, { status: "cancelled" })?.status).toBe("cancelled");
    expect(repo.getSubscription(userId + 1, sub.id)).toBeNull();
    expect(repo.deleteSubscription(userId + 1, sub.id)).toBe(false);
    expect(repo.deleteSubscription(userId, sub.id)).toBe(true);
  });

  it("does not resurrect ignored detections on re-scan", () => {
    const detected = {
      merchantKey: "m:netflix",
      name: "Netflix",
      amount: 15.49,
      currency: "USD",
      billingCycle: "monthly" as const,
      nextBillingDate: "2026-11-05",
      category: "Entertainment",
      cancelUrl: null,
      isTrial: false,
      confidence: 0.9,
      evidence: [],
    };
    repo.saveDetections(userId, [detected]);
    const [pending] = repo.listPendingDetections(userId);
    repo.setDetectionStatus(userId, pending.id, "ignored");
    repo.saveDetections(userId, [{ ...detected, amount: 17.99 }]);
    expect(repo.listPendingDetections(userId)).toEqual([]);
  });
});

describe("validateSubscription", () => {
  it("requires the core fields", () => {
    expect(validateSubscription({ name: "X" })).toEqual({ ok: false, error: "Amount is required" });
    const ok = validateSubscription({ name: " X ", amount: "9.999", currency: "inr", billing_cycle: "yearly", next_billing_date: "2026-11-01" });
    expect(ok).toEqual({
      ok: true,
      value: { name: "X", amount: 10, currency: "INR", billing_cycle: "yearly", next_billing_date: "2026-11-01", category: "Other", cancel_url: null, notes: null },
    });
  });

  it("rejects non-http cancel links", () => {
    expect(validateSubscription({ cancel_url: "javascript:alert(1)" }, true).ok).toBe(false);
  });

  it("accepts partial updates", () => {
    expect(validateSubscription({ status: "cancelled" }, true)).toEqual({ ok: true, value: { status: "cancelled" } });
  });
});
