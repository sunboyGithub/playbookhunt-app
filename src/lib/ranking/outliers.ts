/**
 * Which reported amounts are probably typos.
 *
 * This is the one piece of arithmetic in the project that can mark somebody's
 * real report as suspicious, so the rules are conservative and the reason for
 * every refusal is written down:
 *
 * - **Nothing is deleted.** A flagged amount is still stored, still visible to
 *   an admin, and still the reader's. It is excluded from the median, and the
 *   report keeps its place in the counts.
 * - **Ten amounts is the floor.** Below it the quartiles of a handful of
 *   numbers are the numbers, and an IQR rule on them flags the most
 *   distinctive true value rather than an error.
 * - **The cap fires at any size.** An amount above the playbook's own ceiling
 *   is over the line regardless of the distribution, because the ceiling is
 *   what the field said it was for. The brief requires this at every `n`, so
 *   it is the one rule that does not wait.
 */

import { OUTLIER_IQR_MULTIPLIER, OUTLIER_MIN_AMOUNTS } from "@/config/ranking";

/**
 * The `p`-quantile of a sorted-or-unsorted list, by linear interpolation
 * between order statistics (R type 7, the same definition as `numpy.percentile`
 * and Excel's `PERCENTILE.INC`).
 *
 * Interpolating rather than picking a neighbour because medians are published:
 * a p25 taken from an actual data point on ten numbers jumps in steps of a
 * tenth of the range, and the number this site shows strangers would move by a
 * whole step when one report arrived. A percentile that moves smoothly is one
 * that can be watched.
 */
export function quantile(values: readonly number[], p: number): number | null {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (sorted.length === 0) return null;

  if (p <= 0) return sorted[0] as number;
  if (p >= 1) return sorted[sorted.length - 1] as number;

  const position = p * (sorted.length - 1);
  const lower = Math.floor(position);
  const upper = Math.ceil(position);

  if (lower === upper) return sorted[lower] as number;

  const weight = position - lower;
  return (sorted[lower] as number) * (1 - weight) + (sorted[upper] as number) * weight;
}

/** The median, which is the p50 of the same definition. */
export function median(values: readonly number[]): number | null {
  return quantile(values, 0.5);
}

export function p25(values: readonly number[]): number | null {
  return quantile(values, 0.25);
}

export function p75(values: readonly number[]): number | null {
  return quantile(values, 0.75);
}

export type OutlierDecision = {
  isOutlier: boolean;
  /** Why, for the admin queue. Null when the amount is ordinary. */
  reason: "over_cap" | "iqr_fence" | null;
};

/**
 * Whether one amount is an outlier, and why.
 *
 * `cap` is the playbook's own `AMOUNT_CAPS` ceiling. A cap of zero means the
 * field is not offered — a binary playbook has no amount — and is not
 * compared, because "zero is more than zero" flags every value a reader could
 * have typed for a playbook that never asked for one.
 */
export function isOutlier(
  amount: number,
  allAmounts: readonly number[],
  cap: number,
): OutlierDecision {
  if (!Number.isFinite(amount)) {
    return { isOutlier: true, reason: "iqr_fence" };
  }

  if (cap > 0 && amount > cap) {
    return { isOutlier: true, reason: "over_cap" };
  }

  if (allAmounts.length < OUTLIER_MIN_AMOUNTS) {
    return { isOutlier: false, reason: null };
  }

  const q1 = quantile(allAmounts, 0.25);
  const q3 = quantile(allAmounts, 0.75);
  if (q1 === null || q3 === null) {
    return { isOutlier: false, reason: null };
  }

  const fence = q3 + OUTLIER_IQR_MULTIPLIER * (q3 - q1);
  if (amount > fence) {
    return { isOutlier: true, reason: "iqr_fence" };
  }

  return { isOutlier: false, reason: null };
}

/**
 * The ceiling above which `flagOutliers` stops.
 *
 * Exported so the submission path and the aggregation path can agree on it
 * without one of them re-deriving it — they run at different times, and a
 * report that was not an outlier when filed must not silently become one a
 * week later without anybody deciding it should.
 */
export function outlierFence(amounts: readonly number[]): number | null {
  if (amounts.length < OUTLIER_MIN_AMOUNTS) return null;
  const q1 = quantile(amounts, 0.25);
  const q3 = quantile(amounts, 0.75);
  if (q1 === null || q3 === null) return null;
  return q3 + OUTLIER_IQR_MULTIPLIER * (q3 - q1);
}