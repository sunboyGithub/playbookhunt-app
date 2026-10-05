/**
 * What the ranking functions read.
 *
 * These are the plain shapes, not the database rows. That separation is the
 * whole design: `aggregate()` is a pure function over these, so every rule in
 * AGENTS.md's ranking section is testable with a literal fixture and no
 * database, and the refresh job's only job is to turn rows into these.
 *
 * Everything is a `Date | string` where a date is involved, because
 * `timestamptz` arrives from PostgREST as a string and the alternative —
 * converting at every call site — is how a timezone bug gets in.
 */

import type { OutcomeType, ReportResult } from "@/lib/report/shape";

export type ReportStatus = "pending" | "approved" | "rejected";

/**
 * One outcome report, flattened to the columns ranking actually reads.
 *
 * Note what is *absent*: `referral_code`, `note`, `provider`, `region`. The
 * brief is explicit that referral codes and credits never affect ranking, and
 * the cheapest way to guarantee that is for the type ranking consumes to have
 * no field to read them from. A test asserts the score is identical with and
 * without them, but the type makes the test almost unnecessary.
 */
export type RankableReport = {
  id: string;
  /** `profiles.id`. Present so a report can be joined to its reporter. */
  reporterId: string;
  result: ReportResult;
  /** Saved money, in the playbook's own unit, or null. */
  amount: number | null;
  /** Saved time, in hours, or null. */
  hoursSaved: number | null;
  status: ReportStatus;
  /** Set by moderation or by the IQR rule. Excluded from every statistic. */
  isOutlier: boolean;
  /** Whether the evidence attached to this report has been approved. */
  hasApprovedEvidence: boolean;
  /** `auth.users.email_confirmed_at is not null`, denormalised onto profiles. */
  reporterEmailVerified: boolean;
  /** `profiles.created_at` — how old the account is when the report lands. */
  reporterCreatedAt: Date | string;
  createdAt: Date | string;
};

export type TryAction = "started" | "copied" | "opened";

/** One `try_events` row. A `started` event is what counts as a try. */
export type RankableTry = {
  userId: string | null;
  deviceId: string;
  action: TryAction;
  createdAt: Date | string;
};

/** The playbook columns ranking reads. */
export type RankablePlaybook = {
  id: string;
  slug: string;
  categoryId: string;
  outcomeType: OutcomeType;
  /** null for a catalogue entry nobody has claimed. */
  authorId: string | null;
  lastVerifiedAt: Date | string | null;
  /** The moderation ceiling from `AMOUNT_CAPS`, passed in rather than re-derived. */
  amountCap: number;
};

/**
 * One category's already-aggregated statistics, used for the terms that are
 * relative to peers: `outcomeStrength` and the two "top slice" badges.
 *
 * Two passes, because both of those are circular — a playbook's percentile
 * depends on its peers' medians, and its peers' medians do not depend on it, so
 * the medians can be computed for everybody first and the relative terms
 * second.
 */
export type PeerStat = {
  playbookId: string;
  categoryId: string;
  outcomeType: OutcomeType;
  /** The median, in this playbook's own unit. Null when there are too few amounts. */
  medianAmount: number | null;
  amountN: number;
  triedCount: number;
  wilsonLowerBound: number;
  /** The trust-weighted, decayed success fed to Wilson. Not stored; recomputed. */
  weightedSuccess: number;
};

export type Badge =
  | "verified_recent"
  | "high_success"
  | "top_saver"
  | "most_tried";

/** Everything `aggregate` produces, ready to be written to `playbook_stats`. */
export type AggregatedStats = {
  triedCount: number;
  reportCount: number;
  worked: number;
  partly: number;
  didnt: number;
  /** `worked / report_count`. This is what the UI labels "% worked". */
  successRateRaw: number | null;
  /**
   * The trust-weighted, decayed success — `(worked·1 + partly·0.5)`, each report
   * scaled by its weight and then by its decay. Stored so the number behind the
   * score is inspectable without recomputing it.
   */
  weightedSuccess: number | null;
  wilsonLowerBound: number;
  medianAmount: number | null;
  p25: number | null;
  p75: number | null;
  amountN: number;
  last30Success: number | null;
  lastReportAt: Date | string | null;
  /** Filled in by the second pass, when peers are known. */
  evidenceScore: number;
  trendingScore: number;
  /** Set when the amount statistics were computed from this many amounts. */
  lastVerifiedAt: Date | string | null;
} & EligibilityFlags;

export type EligibilityFlags = {
  showRate: boolean;
  showMedian: boolean;
  strongestEligible: boolean;
  badges: Badge[];
  evidenceApproved: number;
};

/** Dates parsed once per call rather than per row. */
export function toDate(value: Date | string | null | undefined): Date | null {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}