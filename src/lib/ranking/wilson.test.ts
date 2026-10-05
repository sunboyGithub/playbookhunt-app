import { describe, expect, it } from "vitest";

import { WILSON_Z } from "@/config/ranking";
import { wilsonLowerBound, weightedWilsonLowerBound } from "@/lib/ranking/wilson";

describe("wilsonLowerBound", () => {
  it("is 0 for no reports at all", () => {
    // Not NaN and not an exception. Zero reports is the lowest possible
    // evidence, not an absent measurement, and every playbook in a fresh
    // catalogue has to be able to call this.
    expect(wilsonLowerBound(0, 0)).toBe(0);
    expect(wilsonLowerBound(1, 0)).toBe(0);
  });

  it("is 0 for a negative or non-finite sample size", () => {
    expect(wilsonLowerBound(0.5, -3)).toBe(0);
    expect(wilsonLowerBound(0.5, Number.NaN)).toBe(0);
  });

  it("is below the raw rate, always", () => {
    // The entire point. A lower bound that could exceed the rate it bounds
    // would be a coincidence, not a bound.
    for (const [p, n] of [
      [0.4, 30],
      [0.68, 100],
      [0.95, 20],
      [1, 5],
      [0, 500],
    ] as const) {
      expect(wilsonLowerBound(p, n)).toBeLessThanOrEqual(p);
    }
  });

  it("rises with sample size at a fixed rate", () => {
    // Same 60% rate, more evidence: the bound climbs towards it.
    const small = wilsonLowerBound(0.6, 5);
    const medium = wilsonLowerBound(0.6, 50);
    const large = wilsonLowerBound(0.6, 5_000);

    expect(small).toBeLessThan(medium);
    expect(medium).toBeLessThan(large);
    // Not 0.6: even at n = 5,000 the bound is still below the raw rate.
    expect(large).toBeGreaterThan(0.58);
    expect(large).toBeLessThan(0.6);
  });

  it("crushes a tiny sample far below a large one at the same rate", () => {
    // This is the arithmetic behind AGENTS.md's 20-report threshold. Four out
    // of five is 80% and scores like a coin toss.
    expect(wilsonLowerBound(0.8, 5)).toBeLessThan(0.5);
    expect(wilsonLowerBound(0.6, 5_000)).toBeGreaterThan(0.5);
  });

  it("is 0 for a rate of 0 with a real sample", () => {
    // Every report was a "didn't work": the lower bound of the interval is
    // genuinely at the floor.
    expect(wilsonLowerBound(0, 100)).toBe(0);
  });

  it("stays inside [0, 1] at the extremes", () => {
    expect(wilsonLowerBound(1, 3)).toBeGreaterThanOrEqual(0);
    expect(wilsonLowerBound(1, 3)).toBeLessThanOrEqual(1);
    expect(wilsonLowerBound(1, 10_000)).toBeGreaterThan(0.99);
  });

  it("clamps a rate outside [0, 1] instead of returning NaN", () => {
    // A caller that got here has a bug upstream. A NaN would poison every sum
    // it entered, silently; a clamped number is visibly wrong on the page.
    expect(wilsonLowerBound(1.4, 100)).toBe(wilsonLowerBound(1, 100));
    expect(wilsonLowerBound(-0.2, 100)).toBe(0);
  });

  it("uses the brief's z by default", () => {
    expect(WILSON_Z).toBe(1.96);
    expect(wilsonLowerBound(0.6, 100)).toBe(wilsonLowerBound(0.6, 100, 1.96));
  });

  it("widens with z", () => {
    expect(wilsonLowerBound(0.6, 100, 2.576)).toBeLessThan(wilsonLowerBound(0.6, 100, 1.96));
  });
});

describe("weightedWilsonLowerBound", () => {
  it("is the plain bound when every report weighs one", () => {
    // 80% of 5 reports, unweighted: identical to wilsonLowerBound(0.8, 5).
    expect(weightedWilsonLowerBound(4, 5)).toBeCloseTo(wilsonLowerBound(0.8, 5), 12);
  });

  it("treats a report worth 1.5 as one and a half reports", () => {
    // The trust rules say approved evidence is worth 1.5. This is what that
    // means in the bound: the sample is bigger, so the estimate is firmer.
    const unweighted = weightedWilsonLowerBound(4, 5);
    const withEvidence = weightedWilsonLowerBound(6, 6.5);
    expect(withEvidence).toBeGreaterThan(unweighted);
  });

  it("is 0 for a total weight of zero", () => {
    expect(weightedWilsonLowerBound(0, 0)).toBe(0);
  });

  it("ignores excluded reports entirely rather than counting them as failures", () => {
    // A rejected report contributes weight 0, so it must not widen the sample
    // either. Two readers, one rejected and one approved and worked, is one
    // report: score 1.0 with n = 1.
    expect(weightedWilsonLowerBound(1, 1)).toBeCloseTo(wilsonLowerBound(1, 1), 12);
  });
});