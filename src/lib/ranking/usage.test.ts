import { describe, expect, it } from "vitest";

import { decay } from "@/lib/ranking/weight";
import { recency, usage } from "@/lib/ranking/usage";
import { NOW, daysAgo } from "@/lib/ranking/fixtures";

describe("usage", () => {
  it("is 0 for nothing tried", () => {
    expect(usage(0, 1_000)).toBe(0);
    expect(usage(-5, 1_000)).toBe(0);
  });

  it("is 1 for the busiest playbook on the site", () => {
    expect(usage(1_000, 1_000)).toBe(1);
  });

  it("is between 0 and 1 in between", () => {
    const share = usage(100, 10_000);
    expect(share).toBeGreaterThan(0);
    expect(share).toBeLessThan(1);
  });

  it("is logarithmic, so a decade of tries is worth less than half the term", () => {
    // The reason it is not linear: a linear share would put the whole site on
    // one playbook and leave every other at zero.
    // A decade of tries on a 100,000-try leader is 0.60 of the term, and a
    // hundred on a 10,000-try leader is 0.50. Neither is close to a linear
    // tenth, which is the point.
    expect(usage(1_000, 100_000)).toBeCloseTo(0.6, 2);
    expect(usage(100, 10_000)).toBeCloseTo(0.5, 2);
    expect(usage(100, 1_000)).toBeCloseTo(0.668, 2);
  });

  it("rises monotonically with tries", () => {
    let previous = -1;
    for (const tried of [0, 1, 5, 50, 500, 5_000]) {
      const share = usage(tried, 5_000);
      expect(share).toBeGreaterThan(previous);
      previous = share;
    }
  });

  it("is 0 when nothing anywhere has been tried", () => {
    // A catalogue with no tries at all. Every playbook scores the same, so the
    // term contributes nothing to the order rather than a NaN to a column.
    expect(usage(0, 0)).toBe(0);
    expect(usage(10, 0)).toBe(0);
  });

  it("does not exceed 1 when tried exceeds the maximum", () => {
    // maxTried is a snapshot; a playbook can pass it between runs.
    expect(usage(2_000, 1_000)).toBe(1);
  });
});

describe("recency", () => {
  it("is 0 for a playbook that has never been verified", () => {
    // Not neutral. "Nobody has checked this since it was written" is a fact,
    // and a playbook edited last month and never run is less trustworthy than
    // one run last week even at identical evidence.
    expect(recency(null, NOW)).toBe(0);
  });

  it("is 1 for one verified today", () => {
    expect(recency(new Date(NOW), NOW)).toBe(1);
  });

  it("decays by half every 60 days", () => {
    expect(recency(daysAgo(60), NOW)).toBeCloseTo(0.5, 10);
    expect(recency(daysAgo(120), NOW)).toBeCloseTo(0.25, 10);
  });

  it("is the same curve as report decay, by construction", () => {
    for (const days of [1, 30, 60, 200]) {
      expect(recency(daysAgo(days), NOW)).toBeCloseTo(decay(days), 12);
    }
  });

  it("is 0 for an unparseable timestamp rather than NaN", () => {
    expect(recency("not a date", NOW)).toBe(0);
  });

  it("is 1 for a future timestamp rather than above 1", () => {
    // Same clamp as report decay: a clock skew must not be worth more than
    // verification today.
    const future = new Date(NOW.getTime() + 86_400_000);
    expect(recency(future, NOW)).toBe(1);
  });
});