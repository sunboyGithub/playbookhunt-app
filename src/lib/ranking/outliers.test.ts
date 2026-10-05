import { describe, expect, it } from "vitest";

import { OUTLIER_MIN_AMOUNTS } from "@/config/ranking";
import { isOutlier, median, outlierFence, p25, p75, quantile } from "@/lib/ranking/outliers";

const CAP = 5_000;

describe("quantile", () => {
  it("is null for no values", () => {
    expect(quantile([], 0.5)).toBeNull();
    expect(median([])).toBeNull();
  });

  it("is the value itself for a single number", () => {
    expect(median([7])).toBe(7);
  });

  it("averages the middle two for an even count", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it("sorts before taking the quantile", () => {
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it("ignores values that are not finite", () => {
    expect(median([1, Number.NaN, 3])).toBe(2);
    expect(median([1, Number.POSITIVE_INFINITY, 3])).toBe(2);
  });

  it("clamps p outside [0, 1] to the extremes", () => {
    expect(quantile([1, 2, 3], 0)).toBe(1);
    expect(quantile([1, 2, 3], 1)).toBe(3);
    expect(quantile([1, 2, 3], -1)).toBe(1);
    expect(quantile([1, 2, 3], 2)).toBe(3);
  });

  it("interpolates rather than picking an order statistic", () => {
    // 1,2,3,4 → p25 sits a quarter of the way between 1 and 2. Picking a
    // neighbour instead would make a published median jump in steps.
    expect(p25([1, 2, 3, 4])).toBeCloseTo(1.75, 10);
    expect(p75([1, 2, 3, 4])).toBeCloseTo(3.25, 10);
  });

  it("is symmetric about the median", () => {
    const values = [10, 20, 30, 40, 50];
    expect(p75(values)! - median(values)!).toBeCloseTo(median(values)! - p25(values)!, 10);
  });
});

describe("isOutlier", () => {
  it("flags anything above the playbook's own cap, at any sample size", () => {
    // The one rule that does not wait for ten amounts: the ceiling is what the
    // field said it was for, and the brief requires it at every n.
    expect(isOutlier(CAP + 1, [1, 2, 3], CAP)).toEqual({
      isOutlier: true,
      reason: "over_cap",
    });
    expect(isOutlier(CAP, [1, 2, 3], CAP).isOutlier).toBe(false);
  });

  it("does not treat a cap of zero as a limit of zero", () => {
    // A binary playbook never offered an amount field. Every value a reader
    // could have typed for it would be "over" a cap that means "not offered".
    expect(isOutlier(50, [10, 20, 30], 0).isOutlier).toBe(false);
  });

  it("flags nothing below the minimum sample size", () => {
    // Nine amounts: the quartiles are the numbers themselves, so an IQR rule
    // on them flags the most distinctive true value rather than an error.
    const nine = [10, 11, 12, 13, 14, 15, 16, 17, 900];
    expect(nine.length).toBeLessThan(OUTLIER_MIN_AMOUNTS);
    expect(isOutlier(900, nine, CAP).isOutlier).toBe(false);
  });

  it("flags a value past Q3 + 3·IQR once there are enough amounts", () => {
    const amounts = [10, 12, 11, 13, 12, 11, 14, 12, 13, 11, 5_001];
    expect(isOutlier(5_001, amounts, CAP)).toEqual({ isOutlier: true, reason: "over_cap" });

    // Now with a cap high enough that only the fence can catch it.
    const decision = isOutlier(4_000, amounts, 100_000);
    expect(decision.isOutlier).toBe(true);
  });

  it("leaves an ordinary value alone", () => {
    const amounts = [10, 12, 11, 13, 12, 11, 14, 12, 13, 11, 60];
    expect(isOutlier(12, amounts, CAP)).toEqual({ isOutlier: false, reason: null });
  });

  it("flags a non-finite amount", () => {
    // `Infinity` reaches Postgres and poisons every median over the column, so
    // nothing about it is worth keeping.
    expect(isOutlier(Number.POSITIVE_INFINITY, [1, 2, 3], CAP).isOutlier).toBe(true);
    expect(isOutlier(Number.NaN, [1, 2, 3], CAP).isOutlier).toBe(true);
  });
});

describe("outlierFence", () => {
  it("is null below the minimum sample size", () => {
    expect(outlierFence([1, 2, 3, 4, 5, 6, 7, 8, 9])).toBeNull();
  });

  it("is Q3 + 3·IQR above it", () => {
    const amounts = [10, 12, 11, 13, 12, 11, 14, 12, 13, 11];
    expect(outlierFence(amounts)!).toBeCloseTo(p75(amounts)! + 3 * (p75(amounts)! - p25(amounts)!), 10);
  });

  it("agrees with isOutlier on the same data", () => {
    const amounts = [10, 12, 11, 13, 12, 11, 14, 12, 13, 11];
    const fence = outlierFence(amounts)!;

    expect(isOutlier(fence + 0.01, amounts, 100_000).isOutlier).toBe(true);
    expect(isOutlier(fence, amounts, 100_000).isOutlier).toBe(false);
  });
});