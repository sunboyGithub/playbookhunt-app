/**
 * The ranking module's public surface.
 *
 * Everything the rules need is pure and lives under here. The one file that is
 * not — `refresh.ts` — is deliberately not re-exported, because it is the only
 * one that needs a database, and a caller that reaches for a score should not
 * be able to acquire a connection by accident.
 */

export {
  applyRelativeTerms,
  aggregate,
  countDistinctTries,
  type AggregateInput,
  type Reporter,
} from "@/lib/ranking/aggregate";

export {
  comparableMedian,
  outcomeClass,
  outcomeStrength,
  percentileOf,
  type OutcomeClass,
} from "@/lib/ranking/outcome";

export { isOutlier, median, outlierFence, p25, p75, quantile, type OutlierDecision } from "@/lib/ranking/outliers";

export { trendingScore, type TrendEvent } from "@/lib/ranking/trending";

export { recency, usage } from "@/lib/ranking/usage";

export { decay, daysBetween, reportWeight, successValue, weightedReport } from "@/lib/ranking/weight";

export { wilsonLowerBound, weightedWilsonLowerBound } from "@/lib/ranking/wilson";

export {
  toDate,
  type AggregatedStats,
  type Badge,
  type EligibilityFlags,
  type PeerStat,
  type RankablePlaybook,
  type RankableReport,
  type RankableTry,
  type ReportStatus,
  type TryAction,
} from "@/lib/ranking/types";