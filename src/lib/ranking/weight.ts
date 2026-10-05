/**
 * How much one report is worth, and how that fades.
 *
 * Two multipliers that pull in opposite directions, and the order matters:
 * trust is applied per report, decay per day. Keeping them apart means the
 * weight of a report is a property of the report, and its age is a property of
 * the calendar — so "why does this number move" has two answers instead of one
 * that is a product of four hidden factors.
 */

import {
  NEW_ACCOUNT_DAYS,
  REPORT_HALF_LIFE_DAYS,
  SUCCESS_VALUE,
  TRUST_MULTIPLIERS,
} from "@/config/ranking";
import type { RankableReport } from "@/lib/ranking/types";
import { toDate } from "@/lib/ranking/types";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * How much a report's influence has faded.
 *
 * `0.5 ** (ageDays / halfLife)` — a 60-day-old report is worth exactly half a
 * report from today, and a one-year-old one is worth an eighth. Decay, not a
 * cut-off: a play that worked a year ago probably still works, and dropping it
 * would make the site forget things that are true rather than merely old.
 *
 * A negative age (a clock skew, or a report with a future timestamp) is treated
 * as zero rather than amplified — a future report must not be worth *more* than
 * one filed now, and `0.5 ** -1` is 2.
 */
export function decay(ageDays: number, halfLife = REPORT_HALF_LIFE_DAYS): number {
  // An age that is not a number is a broken date, not a very old report. It
  // gets no influence rather than full influence: a row whose `created_at` did
  // not parse should not be the most persuasive thing on the site.
  if (!Number.isFinite(ageDays)) return 0;
  if (ageDays <= 0) return 1;
  if (!Number.isFinite(halfLife) || halfLife <= 0) return 1;
  return 0.5 ** (ageDays / halfLife);
}

/** `worked` 1, `partly` 0.5, `didnt` 0. */
export function successValue(result: RankableReport["result"]): number {
  return SUCCESS_VALUE[result];
}

/**
 * The trust multiplier on one report: 1.0, 0.5, 1.5, or 0.
 *
 * Zero is not a small number here. It means the report is excluded — rejected,
 * flagged as an outlier, or written by the person who wrote the playbook. Those
 * three are the cases where the report cannot be evidence *about the
 * playbook*, and a weight of 0 is how a sum excludes a term without the caller
 * having to filter first and get it wrong somewhere else.
 *
 * Deliberately takes no `now`. Trust is a property of the report and its author
 * *at the moment it was filed* — the new-account rule measures the gap between
 * the account's creation and the report's filing, not the account's age today.
 * A two-year-old account that filed a report today is not a new account. Adding
 * the parameter "for symmetry" with `weightedReport` would invite exactly that
 * bug, so the asymmetry is the design.
 */
export function reportWeight(
  report: RankableReport,
  playbook: { authorId: string | null },
  reporter: { id: string; emailVerified: boolean; createdAt: Date | string },
): number {
  if (report.status === "rejected" || report.isOutlier) return 0;
  if (playbook.authorId !== null && reporter.id === playbook.authorId) return 0;

  let weight = 1;

  weight *= reporter.emailVerified ? 1 : TRUST_MULTIPLIERS.unverifiedEmail;
  weight *= report.hasApprovedEvidence ? TRUST_MULTIPLIERS.approvedEvidence : 1;

  // Measured at the moment the report was filed, not now. A reader who has had
  // their account for two years filed a report today and that report is not
  // new-accounted, however old the account is when we re-run the job.
  const accountAgeDays = daysBetween(toDate(reporter.createdAt), toDate(report.createdAt));
  if (accountAgeDays !== null && accountAgeDays < NEW_ACCOUNT_DAYS) {
    weight *= TRUST_MULTIPLIERS.newAccount;
  }

  return weight;
}

/**
 * A report's full weight: trust × decay.
 *
 * `now` is a parameter rather than a read of the clock, because every rule in
 * this file is a pure function and the tests need to say which day it is.
 */
export function weightedReport(
  report: RankableReport,
  playbook: { authorId: string | null },
  reporter: { id: string; emailVerified: boolean; createdAt: Date | string },
  now: Date = new Date(),
): number {
  const trust = reportWeight(report, playbook, reporter);
  if (trust === 0) return 0;
  return trust * decay(daysBetween(toDate(report.createdAt), now) ?? 0);
}

/** Whole days between two instants, never negative. Null if either is unparseable. */
export function daysBetween(from: Date | null, to: Date | null): number | null {
  if (from === null || to === null) return null;
  return Math.max(0, (to.getTime() - from.getTime()) / DAY_MS);
}