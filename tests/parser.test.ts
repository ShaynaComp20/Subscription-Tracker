import { describe, expect, it } from "vitest";
import { extractAmount, extractCycle, extractNextBillingDate, parseEmail, parseSender, rootDomain } from "@/lib/parser";

describe("sender parsing", () => {
  it("parses display name and root domain", () => {
    expect(parseSender('"Netflix" <info@mailer.netflix.com>')).toEqual({ name: "Netflix", email: "info@mailer.netflix.com", domain: "netflix.com" });
    expect(parseSender("no_reply@email.apple.com").domain).toBe("apple.com");
    expect(rootDomain("mail.amazon.co.uk")).toBe("amazon.co.uk");
  });
});

describe("amount extraction", () => {
  it("handles common currency formats", () => {
    expect(extractAmount("Total: $15.49")).toEqual({ amount: 15.49, currency: "USD" });
    expect(extractAmount("Amount charged ₹1,499.00")).toEqual({ amount: 1499, currency: "INR" });
    expect(extractAmount("You paid Rs. 199")).toEqual({ amount: 199, currency: "INR" });
    expect(extractAmount("Price 9,99 €")).toEqual({ amount: 9.99, currency: "EUR" });
    expect(extractAmount("Total 12.00 GBP")).toEqual({ amount: 12, currency: "GBP" });
  });

  it("prefers the amount next to 'total' over other numbers", () => {
    expect(extractAmount("Save $5 on your next order! Total charged: $22.99")).toEqual({ amount: 22.99, currency: "USD" });
  });

  it("does not read words ending in 'rs' as rupees", () => {
    expect(extractAmount("Open 24 hours 7 days a week")).toBeNull();
  });
});

describe("cycle and date extraction", () => {
  it("detects cycle wording", () => {
    expect(extractCycle("$9.99/mo")).toBe("monthly");
    expect(extractCycle("Billed annually")).toBe("yearly");
    expect(extractCycle("Your receipt")).toBeNull();
  });

  it("finds the next billing date", () => {
    expect(extractNextBillingDate("Your plan renews on November 5, 2026.")).toEqual({ date: "2026-11-05", isTrial: false });
    expect(extractNextBillingDate("Your free trial ends on 3 Dec 2026")).toEqual({ date: "2026-12-03", isTrial: true });
    expect(extractNextBillingDate("Next billing date: 2026-11-21")).toEqual({ date: "2026-11-21", isTrial: false });
    expect(extractNextBillingDate("Thanks for your order on March 3, 2026")).toBeNull();
  });
});

describe("parseEmail", () => {
  it("recognises a known merchant receipt", () => {
    const s = parseEmail({
      id: "1",
      from: "Netflix <info@account.netflix.com>",
      subject: "Your Netflix membership payment",
      date: Date.UTC(2026, 9, 5),
      body: "We charged $15.49 for your monthly membership. Your next billing date is November 5, 2026.",
    });
    expect(s).toMatchObject({
      merchantKey: "m:netflix",
      merchantName: "Netflix",
      amount: 15.49,
      currency: "USD",
      cycleHint: "monthly",
      nextBillingDate: "2026-11-05",
      date: "2026-10-05",
    });
    expect(s.score).toBeGreaterThanOrEqual(3);
  });

  it("only treats Amazon mail as Prime when it mentions Prime", () => {
    const order = parseEmail({ id: "2", from: "auto-confirm@amazon.com", subject: "Your order has shipped", date: 0, body: "Order total $30.00" });
    expect(order.merchant).toBeNull();
    const prime = parseEmail({ id: "3", from: "prime@amazon.com", subject: "Your Prime membership renews soon", date: 0, body: "$14.99/month" });
    expect(prime.merchantKey).toBe("m:amazon-prime");
  });

  it("attributes payment-processor receipts to the real payee", () => {
    const s = parseEmail({
      id: "4",
      from: "service@paypal.com",
      subject: "Receipt for your automatic payment to Spotify",
      date: 0,
      body: "You sent an automatic payment of $11.99 USD to Spotify AB",
    });
    expect(s.merchantKey).toBe("m:spotify");
  });
});
