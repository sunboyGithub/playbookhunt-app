/**
 * Formatting for outcome statistics, and the thresholds that decide what may be
 * shown at all.
 *
 * AGENTS.md is firm about this: a success percentage appears only at 20 or more
 * reports, a median amount only at 10 or more amounts, and "never fabricate
 * stats" is read as covering implied precision, not just invented numbers. So
 * every figure the UI shows is produced here, and every function that could
 * show a figure returns a discriminated result rather than a string — a caller
 * cannot format a percentage without also deciding whether one is allowed.
 *
 * The thresholds live in `server/queries/types.ts` next to the ranking rules so
 * there is one definition of each, not a copy per layer.
 */

import {
  AMOUNT_THRESHOLD,
  PROVEN_MIN_EVIDENCE_APPROVED,
  REPORT_THRESHOLD,
  type OutcomeType,
} from "@/server/queries/types";

export type OutcomeStats = {
  report_count: number | string | null;
  tried_count: number | string | null;
  /** Stored as a fraction in [0, 1] — 0.68 is 68%. */
  success_rate_raw: number | string | null;
  amount_n: number | string | null;
  median_amount: number | string | null;
  last_verified_at: string | null;
  outcome_type: OutcomeType | null;
  outcome_unit: string | null;
};

/**
 * Merge a playbook with its stats row into the shape the formatters take.
 *
 * The two columns that decide how an outcome reads — `outcome_type` and
 * `last_verified_at` — live on `playbooks`, while the counts and aggregates
 * live on `playbook_stats`. Every caller needs both, so the join happens here
 * once rather than at each call site, where a forgotten column would silently
 * drop the median suffix or the verified date.
 */
export function toOutcomeStats(source: {
  outcome_type?: OutcomeType | string | null;
  outcome_unit?: string | null;
  last_verified_at?: string | null;
  stats?: {
    report_count: number | string | null;
    tried_count: number | string | null;
    success_rate_raw: number | string | null;
    amount_n: number | string | null;
    median_amount: number | string | null;
  } | null;
}): OutcomeStats {
  return {
    report_count: source.stats?.report_count ?? 0,
    tried_count: source.stats?.tried_count ?? 0,
    success_rate_raw: source.stats?.success_rate_raw ?? null,
    amount_n: source.stats?.amount_n ?? 0,
    median_amount: source.stats?.median_amount ?? null,
    last_verified_at: source.last_verified_at ?? null,
    outcome_type: (source.outcome_type as OutcomeType | null) ?? null,
    outcome_unit: source.outcome_unit ?? null,
  };
}

/**
 * A success rate, or the honest alternative when there are too few reports.
 *
 * `early` is not a fallback formatting choice — it is the required rendering.
 * A playbook on four reports must not be able to display "75% worked".
 */
export type SuccessRate =
  | { kind: "rate"; percent: number; n: number }
  | { kind: "early"; reports: number };

export function formatSuccessRateFrom(
  stats: Pick<OutcomeStats, "report_count" | "success_rate_raw"> | null | undefined,
): SuccessRate {
  const n = toNumber(stats?.report_count) ?? 0;
  if (n < REPORT_THRESHOLD) {
    return { kind: "early", reports: n };
  }

  const raw = toNumber(stats?.success_rate_raw);
  if (raw === null) {
    // Enough reports to show a rate, but the aggregation job (P9) has not
    // written one yet. Reporting a percentage here would mean inventing it; this
    // returns "early" so the caller shows the report count instead, which
    // understates a well-reported playbook rather than lying about it.
    return { kind: "early", reports: n };
  }

  return { kind: "rate", percent: Math.round(raw * 100), n };
}

/**
 * Postgres `numeric` is typed `number` by the generator but arrives as a JSON
 * number only when it has no trailing precision; anything it cannot represent
 * exactly comes back as a string. Coercing here means no caller has to know
 * which.
 *
 * `success_rate_raw` is stored as a fraction in [0, 1], not a percentage —
 * the P9 job writes it that way, so 0.68 is 68%.
 */
function toNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(parsed) ? parsed : null;
}

/** Thousands separators, because "68% worked (n=1,247)" reads and "n=1247" does not. */
export function formatCount(n: number | string | null | undefined): string {
  return (toNumber(n) ?? 0).toLocaleString("en-US");
}

/** Unit suffix for a money outcome, taken from the playbook's own outcome_type. */
function moneySuffix(outcomeType: OutcomeType | null | undefined): string {
  switch (outcomeType) {
    case "money_monthly":
      return "/mo";
    case "money_yearly":
      return "/yr";
    default:
      // money_once and binary both read as a plain dollar figure.
      return "";
  }
}

/**
 * A money amount, formatted to whole units.
 *
 * Cents are dropped deliberately: nobody decides to switch plans over $18.40,
 * and a false precision is exactly what the brief forbids.
 */
export function formatMoney(amount: number | string | null | undefined): string {
  return `$${Math.round(toNumber(amount) ?? 0).toLocaleString("en-US")}`;
}

/** Hours saved, pluralised properly for the 1-hour case. */
export function formatHours(hours: number | string | null | undefined): string {
  const rounded = Math.round(toNumber(hours) ?? 0);
  return `${rounded} ${rounded === 1 ? "hr" : "hrs"} saved`;
}

/**
 * The median outcome, or null when there are too few amounts to have one.
 *
 * Returning null rather than a placeholder string is deliberate: the caller
 * omits the whole clause, so "Median —" never reaches the page.
 */
export function formatMedianOutcome(stats: OutcomeStats | null | undefined): string | null {
  const n = toNumber(stats?.amount_n) ?? 0;
  const median = toNumber(stats?.median_amount);
  if (n < AMOUNT_THRESHOLD || median === null) {
    return null;
  }

  if (stats?.outcome_type === "time_hours") {
    return formatHours(median);
  }
  return `${formatMoney(median)}${moneySuffix(stats?.outcome_type)}`;
}

/**
 * How long ago something was verified, as "3d ago".
 *
 * Days are the unit throughout rather than switching to weeks and months: the
 * copy sits next to evidence a reader is weighing, and "38d ago" is more
 * informative than "5w ago". A future timestamp — clock skew, or a row written
 * with a bad `now()` — reads as "today" rather than a negative age.
 */
export function formatRelativeDate(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) {
    return "";
  }

  const then = Date.parse(iso);
  if (Number.isNaN(then)) {
    return "";
  }

  const days = Math.floor((now - then) / 86_400_000);
  if (days <= 0) {
    return "today";
  }
  if (days === 1) {
    return "yesterday";
  }
  return `${days}d ago`;
}

/** "verified 3d ago", or null when the playbook has never been verified. */
export function formatVerified(
  lastVerifiedAt: string | null | undefined,
  now = Date.now(),
): string | null {
  const relative = formatRelativeDate(lastVerifiedAt, now);
  return relative ? `verified ${relative}` : null;
}

/**
 * Evidence line 1 on a card: "1,247 tried · 68% worked (n=412)".
 *
 * The three parts are optional independently, because the data can be missing
 * in any combination: a playbook nobody has tried, one with tries but too few
 * reports for a rate, or one with a rate but no tries counted yet.
 */
export function formatEvidenceLine(
  stats: Pick<OutcomeStats, "tried_count" | "report_count" | "success_rate_raw"> | null | undefined,
): string {
  const parts: string[] = [];

  const tried = toNumber(stats?.tried_count) ?? 0;
  if (tried > 0) {
    parts.push(`${formatCount(tried)} tried`);
  }

  const rate = formatSuccessRateFrom(stats);
  if (rate.kind === "rate") {
    parts.push(`${rate.percent}% worked (n=${formatCount(rate.n)})`);
  } else if (rate.reports > 0) {
    parts.push(`Early · ${formatCount(rate.reports)} reports`);
  }

  return parts.join(" · ");
}

/** Evidence line 2: "Median $18/mo · verified 3d ago", omitting either half. */
export function formatOutcomeLine(
  stats: OutcomeStats | null | undefined,
  now = Date.now(),
): string {
  const parts: string[] = [];

  const median = formatMedianOutcome(stats);
  if (median) {
    parts.push(`Median ${median}`);
  }

  const verified = formatVerified(stats?.last_verified_at, now);
  if (verified) {
    parts.push(verified);
  }

  return parts.join(" · ");
}

/**
 * Whether a playbook may be labelled "Proven to work".
 *
 * AGENTS.md's bar is at least 20 reports *and* at least 3 evidence-approved
 * reports. The evidence count is not derivable from `playbook_stats`, so the
 * caller passes it in; this function owns the comparison so the rule is stated
 * once.
 */
export function canClaimProven(
  reportCount: number | string | null | undefined,
  evidenceApproved: number,
): boolean {
  return (
    (toNumber(reportCount) ?? 0) >= REPORT_THRESHOLD &&
    evidenceApproved >= PROVEN_MIN_EVIDENCE_APPROVED
  );
}

/** Compact form for the row card's evidence box: "68% worked" / "Early · 9 reports". */
export function formatEvidenceHeadline(
  stats: Pick<OutcomeStats, "report_count" | "success_rate_raw"> | null | undefined,
): string {
  const rate = formatSuccessRateFrom(stats);
  return rate.kind === "rate" ? `${rate.percent}% worked` : `Early · ${formatCount(rate.reports)} reports`;
}

/** "n=412" for the small line under the headline, or null when there is no rate. */
export function formatEvidenceSampleSize(
  stats: Pick<OutcomeStats, "report_count" | "success_rate_raw"> | null | undefined,
): string | null {
  const rate = formatSuccessRateFrom(stats);
  return rate.kind === "rate" ? `n=${formatCount(rate.n)}` : null;
}

export { AMOUNT_THRESHOLD, REPORT_THRESHOLD };