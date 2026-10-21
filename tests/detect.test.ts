import { describe, expect, it } from "vitest";
import { cycleFromGaps, detectSubscriptions } from "@/lib/detect";
import { parseEmail, type RawEmail } from "@/lib/parser";

const TODAY = "2026-10-21";
const at = (iso: string) => Date.parse(`${iso}T12:00:00Z`);

function email(partial: Partial<RawEmail> & { date: number }): RawEmail {
  return { id: Math.random().toString(36), from: "", subject: "", body: "", ...partial };
}

describe("cycleFromGaps", () => {
  it("infers cycles from charge spacing", () => {
    expect(cycleFromGaps(["2026-07-03", "2026-08-03", "2026-09-03"])).toBe("monthly");
    expect(cycleFromGaps(["2025-05-01", "2026-05-01"])).toBe("yearly");
    expect(cycleFromGaps(["2026-05-01"])).toBeNull();
    expect(cycleFromGaps(["2026-05-01", "2026-05-15"])).toBeNull();
  });
});

describe("detectSubscriptions", () => {
  it("detects an unknown SaaS charging monthly and predicts the next charge", () => {
    const emails = ["2026-07-12", "2026-08-12", "2026-09-12", "2026-10-12"].map((d) =>
      email({ from: "Acme Cloud <billing@acmecloud.io>", subject: "Your Acme Cloud receipt", body: "Payment received. Total: $20.00", date: at(d) }),
    );
    const [sub] = detectSubscriptions(emails.map(parseEmail), TODAY);
    expect(sub).toMatchObject({
      name: "Acme Cloud",
      amount: 20,
      currency: "USD",
      billingCycle: "monthly",
      nextBillingDate: "2026-11-12",
      cancelUrl: null,
    });
    expect(sub.confidence).toBeGreaterThanOrEqual(0.5);
  });

  it("uses an explicit renewal date and the merchant's cancel link", () => {
    const [sub] = detectSubscriptions(
      [
        parseEmail(
          email({
            from: "Spotify <no-reply@spotify.com>",
            subject: "Your Spotify Premium receipt",
            body: "Spotify Premium Individual $11.99/month. Your subscription renews on October 22, 2026.",
            date: at("2026-09-22"),
          }),
        ),
      ],
      TODAY,
    );
    expect(sub).toMatchObject({ name: "Spotify", nextBillingDate: "2026-10-22", cancelUrl: "https://www.spotify.com/account/subscription/" });
  });

  it("ignores one-off receipts from unknown senders", () => {
    const one = parseEmail(email({ from: "shop@randomstore.com", subject: "Your receipt", body: "Total $45.00", date: at("2026-10-01") }));
    expect(detectSubscriptions([one], TODAY)).toEqual([]);
  });

  it("drops subscriptions that stopped billing long ago", () => {
    const old = ["2025-01-05", "2025-02-05", "2025-03-05"].map((d) =>
      parseEmail(email({ from: "Hulu <billing@hulu.com>", subject: "Your Hulu subscription receipt", body: "Total $7.99 monthly", date: at(d) })),
    );
    expect(detectSubscriptions(old, TODAY)).toEqual([]);
  });
});
