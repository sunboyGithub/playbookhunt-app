/**
 * The two terms that are not about outcomes: how many people tried it, and how
 * recently somebody checked it.
 *
 * Both are capped at 1 so that neither can outvote the evidence. A playbook
 * tried ten thousand times by one person on a loop scores a full 0.10 on usage
 * and nothing else, which is the correct total for popularity.
 */

import { RECENCY_HALF_LIFE_DAYS } from "@/config/ranking";
import { decay } from "@/lib/ranking/weight";

/**
 * `log10(1 + tried) / log10(1 + maxTried)` — share of the busiest playbook.
 *
 * Logarithmic because tries are heavy-tailed: the gap between 10 and 100 tries
 * is the whole difference between "a few people found this" and "this works",
 * and the gap between 10,000 and 100,000 is not. A linear share would put the
 * entire site on one playbook and leave every other at zero.
 *
 * Zero when `maxTried` is zero, which is a catalogue with nothing tried in it —
 * every playbook scores the same, so the term contributes nothing to the order
 * rather than a division by zero to a column.
 */
export function usage(tried: number, maxTried: number): number {
  if (!Number.isFinite(tried) || tried <= 0) return 0;
  if (!Number.isFinite(maxTried) || maxTried <= 0) return 0;

  const share = Math.log10(1 + tried) / Math.log10(1 + maxTried);
  return Math.min(1, Math.max(0, share));
}

/**
 * How recently the playbook was verified, decayed over 60 days.
 *
 * Zero when it has never been verified. Not neutral: "nobody has checked this
 * since it was written" is a fact, and a playbook whose prompt was edited last
 * month and has not been run since is genuinely less trustworthy than one that
 * was run last week — even if their evidence is identical. The recency term is
 * only 0.15 of the score, so it nudges rather than decides.
 */
export function recency(
  lastVerifiedAt: Date | string | null,
  now: Date = new Date(),
  halfLife = RECENCY_HALF_LIFE_DAYS,
): number {
  if (lastVerifiedAt === null || lastVerifiedAt === undefined) return 0;

  const then = lastVerifiedAt instanceof Date ? lastVerifiedAt : new Date(lastVerifiedAt);
  if (Number.isNaN(then.getTime())) return 0;

  const ageDays = (now.getTime() - then.getTime()) / (24 * 60 * 60 * 1000);
  return decay(ageDays, halfLife);
}