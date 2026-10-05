/**
 * `trendingScore` — what is being picked up *now*.
 *
 * Separate from the evidence score and never mixed into it. The evidence score
 * answers "does this work", which takes months of reports to establish;
 * trending answers "is anybody doing this this week", which takes hours. Mixing
 * them would let a playbook that is suddenly everywhere out-rank one that has
 * been quietly reliable for a year, and the brief ranks on evidence.
 *
 * Trending is used for its own list and nothing else. That separation is the
 * reason this file exists rather than four more lines in `aggregate`.
 */

import {
  TRENDING_HALF_LIFE_HOURS,
  TRENDING_REPORT_WEIGHT,
  TRENDING_TRY_WEIGHT,
  TRENDING_WINDOW_DAYS,
} from "@/config/ranking";

const HOUR_MS = 60 * 60 * 1000;

export type TrendEvent = {
  /** A try is worth 1 and a report is worth 3. */
  kind: "try" | "report";
  at: Date | string;
};

/**
 * `Σ (try 1, report 3) × 0.5^(ageHours / 48)` over the last seven days.
 *
 * Halving every 48 hours means an event at the edge of the window is worth
 * about 0.2 and one from last week is nearly gone, so the number is dominated
 * by the last three days. A burst therefore beats steady old traffic outright,
 * which is the behaviour the brief asks for and the reason trending is a
 * separate column rather than a filter on `updated_at`.
 */
export function trendingScore(events: readonly TrendEvent[], now: Date = new Date()): number {
  const windowMs = TRENDING_WINDOW_DAYS * 24 * HOUR_MS;
  let total = 0;

  for (const event of events) {
    const at = event.at instanceof Date ? event.at : new Date(event.at);
    if (Number.isNaN(at.getTime())) continue;

    const ageMs = now.getTime() - at.getTime();
    // Outside the window in either direction. A future event contributes
    // nothing rather than a weight above 1, for the same reason `decay` clamps.
    if (ageMs < 0 || ageMs > windowMs) continue;

    const ageHours = ageMs / HOUR_MS;
    const base = event.kind === "report" ? TRENDING_REPORT_WEIGHT : TRENDING_TRY_WEIGHT;

    total += base * 0.5 ** (ageHours / TRENDING_HALF_LIFE_HOURS);
  }

  return total;
}