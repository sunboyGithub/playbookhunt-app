/**
 * The Wilson score lower bound.
 *
 * Why not a plain success percentage: because 5 reports and 500 reports both
 * produce a number, and only one of them means anything. A raw rate lets a
 * lucky 4-out-of-5 outrank a well-evidenced 68-out-of-100, and it is the whole
 * reason AGENTS.md asks for a lower bound rather than a rate.
 *
 * The bound is the pessimistic end of a confidence interval on the true rate, so
 * a small sample is pushed down towards zero and only a genuinely high rate on
 * a genuinely large sample climbs. It is bounded below by 0 and above by 1 by
 * construction, which means it can be mixed into a weighted sum without
 * clamping anything afterwards.
 */

import { WILSON_Z } from "@/config/ranking";

/**
 * `wilsonLowerBound(p, n, z = 1.96)`.
 *
 * `n = 0` returns 0 rather than NaN. Zero reports is not an unknown success
 * rate that happens to be undefined — it is a playbook nobody has reported on,
 * and "nobody has reported on it" is the lowest possible evidence, not an
 * absent one.
 */
export function wilsonLowerBound(p: number, n: number, z: number = WILSON_Z): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (!Number.isFinite(p)) return 0;

  // A rate outside [0, 1] is not a rate. Clamping rather than returning NaN,
  // because a caller that got here has a bug upstream and a NaN would poison
  // every sum it enters silently.
  const rate = Math.min(1, Math.max(0, p));

  const z2 = z * z;
  const denominator = 1 + z2 / n;
  const centre = rate + z2 / (2 * n);
  const margin = z * Math.sqrt((rate * (1 - rate) + z2 / (4 * n)) / n);

  const bound = (centre - margin) / denominator;

  // Floating point can push a perfect 1 slightly under and a hopeless 0
  // slightly under too; the lower bound is never negative.
  return Math.min(1, Math.max(0, bound));
}

/**
 * The Wilson bound for a set of weighted outcomes.
 *
 * The weighted sum of the outcomes is the point estimate and the sum of the
 * weights is the sample size. That is not exactly the same as Wilson on the
 * unweighted counts — it is Wilson on a sample where each report is worth
 * `w` reports — which is the interpretation the trust rules ask for: a report
 * with approved evidence is allowed to count for one and a half.
 */
export function weightedWilsonLowerBound(
  weightedSuccess: number,
  totalWeight: number,
  z: number = WILSON_Z,
): number {
  if (totalWeight <= 0) return 0;
  return wilsonLowerBound(weightedSuccess / totalWeight, totalWeight, z);
}