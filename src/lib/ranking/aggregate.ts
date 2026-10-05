/**
 * `aggregate(playbook, reports, tries)` — every number on the stats row.
 *
 * Pure. No database, no clock, no environment. It takes the rows and a `now`,
 * and returns the row. That is what makes the ranking rules testable as
 * arithmetic rather than as assertions about a database that happens to be
 * running, and it is why the refresh job is only a translation layer.
 *
 * ## What is excluded, and why
 *
 * Three kinds of report contribute nothing at all, which is expressed as a
 * weight of zero rather than as a filter:
 *
 * - **Rejected** — a moderator said it does not stand.
 * - **Outliers** — a typo, or an amount past the playbook's own ceiling.
 * - **The playbook author's own** — the brief's rule, and the one that matters
 *   most in practice. A playbook whose author files twenty "it worked" reports
 *   has an evidence score of 1.0 and no evidence whatsoever.
 *
 * `report_count` counts the same set, because the 20-report threshold for
 * showing a percentage has to be a threshold on reports that count. Counting
 * the excluded ones towards the threshold while excluding them from the
 * numerator would let an author unlock the percentage with their own rows and
 * then fill it with nobody else's.
 *
 * ## Two different success numbers, on purpose
 *
 * `successRateRaw` is `worked / report_count`, because that is what the UI
 * labels "% worked" and a label has to be true.
 *
 * `weightedSuccess` is the quantity Wilson is computed on: each report worth
 * `worked` 1 or `partly` 0.5, scaled by trust, decayed by age. It is a
 * different number on purpose — that is the whole mechanism by which evidence
 * and recency reach the score — and it is stored rather than recomputed so that
 * the number behind a ranking can be read rather than inferred.
 */

import {
  BADGE_TOP_FRACTION,
  HIGH_SUCCESS_WILSON,
  PROVEN_MIN_EVIDENCE,
  PROVEN_MIN_REPORTS,
  RANKING_WEIGHTS,
  REPORT_THRESHOLD,
  AMOUNT_THRESHOLD,
  VERIFIED_RECENT_DAYS,
} from "@/config/ranking";
import { comparableMedian, outcomeClass, outcomeStrength } from "@/lib/ranking/outcome";
import { median, outlierFence, p25, p75 } from "@/lib/ranking/outliers";
import { trendingScore, type TrendEvent } from "@/lib/ranking/trending";
import type {
  AggregatedStats,
  PeerStat,
  RankablePlaybook,
  RankableReport,
  RankableTry,
} from "@/lib/ranking/types";
import { toDate } from "@/lib/ranking/types";
import { recency, usage } from "@/lib/ranking/usage";
import { successValue, weightedReport } from "@/lib/ranking/weight";
import { weightedWilsonLowerBound } from "@/lib/ranking/wilson";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Everything `aggregate` needs about a reporter, joined in from `profiles` and
 * `auth.users`.
 *
 * `emailVerified` is denormalised onto `profiles` by a trigger, because
 * `auth.users` is not readable through PostgREST and the ranking job runs on
 * the same service-role client as everything else.
 */
export type Reporter = {
  id: string;
  emailVerified: boolean;
  createdAt: Date | string;
};

export type AggregateInput = {
  playbook: RankablePlaybook;
  reports: readonly RankableReport[];
  /** Distinct reporters by id, so a report's reporter can be found in O(1). */
  reporters: readonly Reporter[];
  /** Every `try_events` row for this playbook, including the non-`started` ones. */
  tries: readonly RankableTry[];
  /** Approved reports in the last seven days, for trending. Defaults to `reports`. */
  recentReports?: readonly RankableReport[];
};

/**
 * Distinct people who started the try flow.
 *
 * Counted per `user_id` where there is one and per `device_id` where there is
 * not. A signed-in reader with two devices is one person; an anonymous reader
 * is counted by the server-issued device cookie, which is the same one that
 * makes the follow-up work. Counting `started` events instead would count one
 * reader opening the flow five times as five tries, and the number the site
 * publishes says "people tried this".
 */
export function countDistinctTries(tries: readonly RankableTry[]): number {
  const people = new Set<string>();

  for (const try_ of tries) {
    if (try_.action !== "started") continue;
    people.add(try_.userId ? `u:${try_.userId}` : `d:${try_.deviceId}`);
  }

  return people.size;
}

export function aggregate(
  input: AggregateInput,
  now: Date = new Date(),
): AggregatedStats {
  const { playbook, reports, reporters, tries } = input;

  const reporterById = new Map(reporters.map((reporter) => [reporter.id, reporter]));

  /* --------------------------------------------------------- which reports */

  // Rejected, flagged as an outlier, or written by the playbook's own author.
  // All three contribute nothing at all, which is why the exclusion is a
  // weight of zero in `reportWeight` as well as a filter here — one rule, read
  // from the same place by both.
  //
  // There is a real argument for keeping an outlier's *result* and dropping only
  // its amount: the flag is a claim about the number, not about whether it
  // worked. The brief says "author's own, rejected and outlier reports weigh 0"
  // and then, in the required scenarios, "author's own reports and outliers do
  // not change stats". A report that changes `report_count` changes a stat, so
  // the brief wins and the argument is recorded here rather than acted on.
  const counted = reports.filter((report) => {
    if (report.status !== "approved") return false;
    if (report.isOutlier) return false;

    const reporter = reporterById.get(report.reporterId);
    if (reporter && playbook.authorId !== null && reporter.id === playbook.authorId) return false;

    return true;
  });

  const reportCount = counted.length;
  const worked = counted.filter((report) => report.result === "worked").length;
  const partly = counted.filter((report) => report.result === "partly").length;
  const didnt = counted.filter((report) => report.result === "didnt").length;

  const evidenceApproved = counted.filter((report) => report.hasApprovedEvidence).length;

  /* ------------------------------------------------------ the two successes */

  // The label on the page says "% worked", so this one really is the worked
  // count over the counted total and nothing else.
  const successRateRaw = reportCount > 0 ? worked / reportCount : null;

  // The one Wilson is computed on: trust-weighted, aged, and scoring `partly`
  // at half rather than at zero.
  let weightTotal = 0;
  let weightedSuccessTotal = 0;

  for (const report of counted) {
    const reporter = reporterById.get(report.reporterId);
    if (!reporter) continue;

    const weight = weightedReport(report, playbook, reporter, now);
    if (weight === 0) continue;

    weightTotal += weight;
    weightedSuccessTotal += weight * successValue(report.result);
  }

  const weightedSuccess = weightTotal > 0 ? weightedSuccessTotal / weightTotal : null;
  const wilson = weightedWilsonLowerBound(weightedSuccessTotal, weightTotal);

  /* ------------------------------------------------------------- the money */

  const isMoney = outcomeClass(playbook.outcomeType) === "money";
  const rawAmounts = counted
    .map((report) => (isMoney ? report.amount : report.hoursSaved))
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  const amountN = rawAmounts.length;

  // Amounts arrive already flagged by the submission path, which applied the
  // cap at the moment of filing. The IQR fence is recomputed here as well
  // because the distribution moves: a report that looked ordinary against five
  // others may not against thirty. Only the median is affected — the report
  // keeps its place in the counts either way.
  const fence = outlierFence(rawAmounts);
  const amounts = fence === null ? rawAmounts : rawAmounts.filter((amount) => amount <= fence);

  const medianAmount = median(amounts);
  const quartileLow = p25(amounts);
  const quartileHigh = p75(amounts);

  /* ------------------------------------------------------------ last 30 */

  const cutoff = now.getTime() - 30 * DAY_MS;
  const recent = counted.filter((report) => {
    const at = toDate(report.createdAt);
    return at !== null && at.getTime() >= cutoff;
  });
  const recentWorked = recent.filter((report) => report.result === "worked").length;
  const last30Success = recent.length > 0 ? recentWorked / recent.length : null;

  const lastReportDates = counted.map((report) => toDate(report.createdAt)).filter(Boolean) as Date[];
  const lastReportAt =
    lastReportDates.length > 0
      ? new Date(Math.max(...lastReportDates.map((date) => date.getTime())))
      : null;

  /* ----------------------------------------------------------- trending */

  const trendEvents: TrendEvent[] = [
    ...tries
      .filter((try_) => try_.action === "copied")
      .map((try_) => ({ kind: "try" as const, at: try_.createdAt })),
    ...(input.recentReports ?? reports)
      .filter((report) => report.status === "approved" && !report.isOutlier)
      .map((report) => ({ kind: "report" as const, at: report.createdAt })),
  ];

  const trending = trendingScore(trendEvents, now);

  /* ------------------------------------------------------------ score */

  // usage and recency have no peer context here; they are filled in by
  // `applyRelativeTerms`, which is the only place that knows the catalogue.
  const partial: AggregatedStats = {
    triedCount: countDistinctTries(tries),
    reportCount,
    worked,
    partly,
    didnt,
    successRateRaw,
    weightedSuccess,
    wilsonLowerBound: wilson,
    medianAmount,
    p25: quartileLow,
    p75: quartileHigh,
    amountN,
    last30Success,
    lastReportAt,
    evidenceScore: 0,
    trendingScore: trending,
    lastVerifiedAt: playbook.lastVerifiedAt ?? null,
    showRate: reportCount >= REPORT_THRESHOLD,
    showMedian: amountN >= AMOUNT_THRESHOLD,
    strongestEligible:
      reportCount >= PROVEN_MIN_REPORTS && evidenceApproved >= PROVEN_MIN_EVIDENCE,
    badges: [],
    evidenceApproved,
  };

  return partial;
}

/**
 * The peer-relative half of the score and the badges.
 *
 * Split out because it is genuinely a second pass: `outcomeStrength` needs
 * every playbook's median before it can rank any of them, and `usage` needs
 * the busiest playbook on the site. Running either inside `aggregate` would
 * mean aggregating the whole catalogue to compute one row, and the caller
 * would have no way to do that incrementally.
 */
export function applyRelativeTerms(
  self: {
    playbookId: string;
    categoryId: string;
    outcomeType: RankablePlaybook["outcomeType"];
    medianAmount: number | null;
    amountN: number;
    triedCount: number;
    wilsonLowerBound: number;
    lastVerifiedAt: Date | string | null;
  },
  catalogue: readonly PeerStat[],
  maxTried: number,
  now: Date = new Date(),
): { evidenceScore: number; badges: AggregatedStats["badges"] } {
  const categoryPeers = catalogue.filter((peer) => peer.categoryId === self.categoryId);

  const outcome = outcomeStrength(self, categoryPeers);
  const popularity = usage(self.triedCount, maxTried);
  const freshness = recency(self.lastVerifiedAt, now);

  const evidenceScore =
    RANKING_WEIGHTS.wilson * self.wilsonLowerBound +
    RANKING_WEIGHTS.outcome * outcome +
    RANKING_WEIGHTS.recency * freshness +
    RANKING_WEIGHTS.usage * popularity;

  const badges: AggregatedStats["badges"] = [];

  const verifiedAt = toDate(self.lastVerifiedAt);
  if (verifiedAt !== null) {
    const ageDays = (now.getTime() - verifiedAt.getTime()) / DAY_MS;
    if (ageDays <= VERIFIED_RECENT_DAYS) badges.push("verified_recent");
  }

  if (self.wilsonLowerBound >= HIGH_SUCCESS_WILSON) badges.push("high_success");

  if (isTopSlice(self.triedCount, categoryPeers.map((peer) => peer.triedCount))) {
    badges.push("most_tried");
  }

  // The same normalisation `outcomeStrength` uses, so "top saver" and the
  // outcome term can never disagree about what a comparable amount is.
  const mine = comparableMedian(self.medianAmount, self.outcomeType) ?? 0;
  const peerAmounts = categoryPeers.map(
    (peer) => comparableMedian(peer.medianAmount, peer.outcomeType) ?? 0,
  );

  if (isTopSlice(mine, peerAmounts)) badges.push("top_saver");

  return { evidenceScore, badges };
}

/**
 * Whether a value is in the top decile of its category.
 *
 * The threshold is the 90th percentile of the category, so it moves with the
 * category rather than being a fixed number that means something different on
 * every page. Ties count: if half the category shares the top value, they all
 * get the badge, because a badge that arbitrarily excludes some of the
 * playbooks that earned it is worse than a badge that is generous.
 */
function isTopSlice(value: number, peers: readonly number[]): boolean {
  if (peers.length === 0) return false;

  const threshold = quantileAt(peers, 1 - BADGE_TOP_FRACTION);
  if (threshold === null) return false;

  return value >= threshold;
}

function quantileAt(values: readonly number[], p: number): number | null {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return null;

  const position = p * (sorted.length - 1);
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower] as number;

  const weight = position - lower;
  return (sorted[lower] as number) * (1 - weight) + (sorted[upper] as number) * weight;
}