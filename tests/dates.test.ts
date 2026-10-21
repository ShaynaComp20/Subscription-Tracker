import { describe, expect, it } from "vitest";
import { addCycles, addMonths, daysBetween, isISODate, rollForward, todayISO } from "@/lib/dates";

describe("dates", () => {
  it("clamps month-end when adding months", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonths("2026-12-15", 1)).toBe("2027-01-15");
  });

  it("adds billing cycles", () => {
    expect(addCycles("2026-03-01", "weekly", 2)).toBe("2026-03-15");
    expect(addCycles("2026-03-01", "quarterly", 1)).toBe("2026-06-01");
    expect(addCycles("2024-02-29", "yearly", 1)).toBe("2025-02-28");
  });

  it("rolls past dates forward without drifting off month-end", () => {
    expect(rollForward("2026-01-31", "monthly", "2026-03-05")).toBe("2026-03-31");
    expect(rollForward("2026-10-21", "monthly", "2026-10-21")).toBe("2026-10-21");
    expect(rollForward("2026-11-01", "monthly", "2026-10-21")).toBe("2026-11-01");
    expect(rollForward("2025-06-10", "yearly", "2026-10-21")).toBe("2027-06-10");
  });

  it("counts days between dates", () => {
    expect(daysBetween("2026-10-21", "2026-10-22")).toBe(1);
    expect(daysBetween("2026-03-07", "2026-03-09")).toBe(2); // across US DST change
  });

  it("validates ISO dates", () => {
    expect(isISODate("2026-02-28")).toBe(true);
    expect(isISODate("2026-02-30")).toBe(false);
    expect(isISODate("21/10/2026")).toBe(false);
  });

  it("computes today in a timezone", () => {
    const now = new Date("2026-10-21T23:30:00Z");
    expect(todayISO("UTC", now)).toBe("2026-10-21");
    expect(todayISO("Asia/Kolkata", now)).toBe("2026-10-22");
  });
});
