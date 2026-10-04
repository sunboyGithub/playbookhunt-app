/**
 * The playbook detail page's three stat tiles and its worked/partly/didn't bar.
 *
 * Split out of `format.ts` because those functions return *structured* results
 * rather than strings: a tile is a value plus the label that explains what it
 * counts, and whether that label is a percentage or the word "Early" is a
 * threshold decision the caller must not be able to make for itself. Returning a
 * string here would let a component print `68% worked` on four reports by
 * calling `.toString()` on something it should have had to ask about first.
 *
 * Every threshold is the one in `server/queries/types.ts` and none is restated,
 * so the detail page cannot disagree with the cards about when a number may be
 * shown.
 */

import { AMOUNT_THRESHOLD, REPORT_THRESHOLD } from "@/server/queries/types";

/**
 * The columns the detail page needs from `playbook_stats`, plus the playbook's
 * own outcome columns. A narrower shape than `OutcomeStats` so the 30-day count
 * — which comes from `public_reports`, not from stats — is a parameter rather
 * than a field, and its absence is impossible to overlook.
 */
export type DetailStats = {
  tried_count: number | string | null;
  report_count: number | string | null;
  worked: number | string | null;
  partly: number | string | null;
  didnt: number | string | null;
  success_rate_raw: number | string | null;
  amount_n: number | string | null;
  median_amount: number | string | null;
  /** Fraction in [0, 1], over the last 30 days. Separate from `success_rate_raw`. */
  last30_success: number | string | null;
  outcome_type: "money_monthly" | "money_yearly" | "money_once" | "time_hours" | "binary" | null;
  outcome_unit: string | null;
};

/** Postgres `numeric` arrives as a string when it cannot be represented exactly. */
function toNumber(value: number | string | null | undefined): number {
  if (value === null || value === undefined) {
    return 0;
  }
  const parsed = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(parsed) ? parsed : 0;
}

/* -------------------------------------------------------------------------- */
/* Tile 1 — Tried                                                              */
/* -------------------------------------------------------------------------- */

/**
 * "1,247" — how many people opened the try flow.
 *
 * The one tile with no threshold. A count of people who pressed a button is not
 * an estimate of an outcome, and hiding it below 20 would mean a brand new
 * playbook reads as untried when one person did in fact try it. The tried count
 * never becomes a claim about whether anything worked.
 */
export function triedTile(stats: DetailStats | null | undefined): {
  value: string;
  caption: string;
} {
  const tried = toNumber(stats?.tried_count);

  return {
    value: tried.toLocaleString("en-US"),
    // Singular below 10: "1 tried" and "0 tried" both read as counts, and the
    // "no one has tried this yet" case is the empty-state job, not a caption's.
    caption: tried === 1 ? "person tried this" : "people tried this",
  };
}

/* -------------------------------------------------------------------------- */
/* Tile 2 — Worked                                                             */
/* -------------------------------------------------------------------------- */

export type WorkedTile =
  | { kind: "rate"; percent: number; n: number; caption: string }
  | { kind: "early"; reports: number; caption: string };

/**
 * The success rate, or "Early · N reports" when there are too few to have one.
 *
 * A percentage is produced only at or above `REPORT_THRESHOLD`, and the caption
 * carries the denominator either way — "68% worked" on its own is a number with
 * no sample size attached, which is the whole thing the threshold exists to
 * prevent.
 */
export function workedTile(stats: DetailStats | null | undefined): WorkedTile {
  const n = toNumber(stats?.report_count);

  if (n < REPORT_THRESHOLD) {
    return {
      kind: "early",
      reports: n,
      // "Early · 0 reports" rather than an empty caption. Zero reports is a
      // fact about this playbook and not the same as missing data.
      caption: `Early · ${n} ${n === 1 ? "report" : "reports"}`,
    };
  }

  const raw = stats?.success_rate_raw;
  const parsed = raw === null || raw === undefined ? null : toNumber(raw);

  // Enough reports for a rate, but the aggregation job has not written one.
  // Falling back to "Early" understates a well-reported playbook; inventing the
  // rate would state something nobody measured. The first is recoverable, the
  // second is not.
  if (parsed === null) {
    return { kind: "early", reports: n, caption: `Early · ${n} reports` };
  }

  return {
    kind: "rate",
    percent: Math.round(parsed * 100),
    n,
    caption: `n = ${n.toLocaleString("en-US")} reports`,
  };
}

/* -------------------------------------------------------------------------- */
/* Tile 3 — Median saved                                                       */
/* -------------------------------------------------------------------------- */

export type MedianTile =
  | { kind: "value"; text: string; n: number; caption: string }
  | { kind: "hidden"; n: number; caption: string };

function moneySuffix(outcomeType: DetailStats["outcome_type"] | undefined): string {
  switch (outcomeType) {
    case "money_monthly":
      return "/mo";
    case "money_yearly":
      return "/yr";
    default:
      // money_once and binary both read as a plain figure.
      return "";
  }
}

/**
 * The median outcome, or nothing at all when too few amounts were filed.
 *
 * `hidden` rather than a placeholder string, so the caller omits the whole tile
 * instead of rendering "Median —". A tile whose value is a dash is worse than
 * an absent tile: it looks like a measurement that came back empty.
 */
export function medianTile(stats: DetailStats | null | undefined): MedianTile {
  const n = toNumber(stats?.amount_n);
  const median = stats?.median_amount;
  const medianNumber = median === null || median === undefined ? null : toNumber(median);

  if (n < AMOUNT_THRESHOLD || medianNumber === null) {
    return { kind: "hidden", n, caption: "Not enough data" };
  }

  const text =
    stats?.outcome_type === "time_hours"
      ? `${Math.round(medianNumber)} ${Math.round(medianNumber) === 1 ? "hr" : "hrs"} saved`
      : `$${Math.round(medianNumber).toLocaleString("en-US")}${moneySuffix(stats?.outcome_type)}`;

  return {
    kind: "value",
    text,
    n,
    caption: `n = ${n.toLocaleString("en-US")} with amounts`,
  };
}

/* -------------------------------------------------------------------------- */
/* The worked / partly / didn't bar                                           */
/* -------------------------------------------------------------------------- */

export type BreakdownSegment = {
  key: "worked" | "partly" | "didnt";
  label: string;
  count: number;
  /** Rounded, for the label. The three of these need not sum to 100. */
  percent: number;
  /** Exact, for the bar's geometry. These three always sum to 100. */
  width: number;
};

export type WorkedBreakdown =
  | { kind: "bar"; segments: BreakdownSegment[]; total: number; altText: string }
  | { kind: "empty"; message: string };

/**
 * The stacked bar, or an empty state.
 *
 * The bar's segments are success percentages, so it obeys the same 20-report
 * threshold as the Worked tile — and the threshold is checked here rather than
 * at the call site, because a bar is the easiest place in the product to leak a
 * percentage a headline would never have been allowed to show.
 *
 * Two different numbers per segment, and the reason is not tidiness:
 *
 * - `percent` is `count / report_count`, because that is the share of *all*
 *   reports, and it is rounded for a label.
 * - `width` is `count / sum(counts)`, because the bar has to fill its track.
 *
 * They differ whenever `worked + partly + didnt` is not exactly `report_count`,
 * which happens whenever a report is rejected or flagged an outlier and the
 * aggregation job counts it in one place but not the other. Normalising the
 * widths by the segment sum keeps the bar visually correct; normalising them by
 * `report_count` would render a bar that stops two-thirds of the way across and
 * looks like a rendering bug rather than like what it is.
 *
 * Forcing the three *labels* to sum to 100 would mean inventing percentages, so
 * they are left to round independently and the raw counts are shown beside them.
 */
export function workedBreakdown(stats: DetailStats | null | undefined): WorkedBreakdown {
  const total = toNumber(stats?.report_count);

  if (total < REPORT_THRESHOLD) {
    return {
      kind: "empty",
      message:
        total === 0
          ? "No reports yet — be the first"
          : `Not enough reports yet — ${total} so far`,
    };
  }

  const counts = {
    worked: toNumber(stats?.worked),
    partly: toNumber(stats?.partly),
    didnt: toNumber(stats?.didnt),
  };
  const segmentTotal = counts.worked + counts.partly + counts.didnt;

  const labels = {
    worked: "Worked",
    partly: "Partly worked",
    didnt: "Didn't work",
  } as const;

  const segments = (Object.keys(counts) as (keyof typeof counts)[]).map((key) => ({
    key,
    label: labels[key],
    count: counts[key],
    // A report total of zero is unreachable past the threshold above, so this
    // divide cannot blow up; `segmentTotal` can be zero if every report is
    // excluded, and that case needs a real answer rather than NaN widths.
    percent: Math.round((counts[key] / total) * 100),
    width: segmentTotal === 0 ? 0 : (counts[key] / segmentTotal) * 100,
  }));

  return {
    kind: "bar",
    segments,
    total,
    // The text alternative for a bar that carries its information through width
    // and colour alone. A sentence rather than a label list, because a screen
    // reader announces it as one unit.
    altText: segments
      .map((segment) => `${segment.percent}% ${segment.label} (${segment.count} reports)`)
      .join(", "),
  };
}

/**
 * The "Last 30 days" line, or null when it may not be shown.
 *
 * The denominator is a parameter because `playbook_stats` stores
 * `last30_success` without the count of reports it was computed from. Without
 * that count a 30-day percentage cannot be threshold-checked at all, and an
 * uncheckable percentage is exactly what AGENTS.md forbids — so the caller goes
 * and counts the recent reports itself and passes the number here.
 *
 * It reads `last30_success` and never `success_rate_raw`. The two are
 * different measurements, and labelling the all-time rate as a 30-day figure
 * produces a page whose halves each look right and whose labels disagree.
 */
export function last30Line(
  stats: DetailStats | null | undefined,
  reportsInLast30Days: number,
): { percent: number; caption: string } | null {
  if (reportsInLast30Days < REPORT_THRESHOLD) {
    return null;
  }

  const raw = stats?.last30_success;
  if (raw === null || raw === undefined) {
    return null;
  }

  return {
    percent: Math.round(toNumber(raw) * 100),
    caption: `Last 30 days · n = ${reportsInLast30Days.toLocaleString("en-US")} reports`,
  };
}

/**
 * Narrow a stored `outcome_type` to the union, or null.
 *
 * The column is `text` with a check constraint, so the generated type says
 * `string` and only the database enforces the list. Casting the value would
 * assert the constraint holds — which it does today, and which a hand-edited row
 * could break, and which would then put `$18` on a `time_hours` median. Narrowing
 * it means an unknown value reads as "no outcome type" and the formatter falls
 * back rather than rendering a unit that belongs to a different outcome.
 */
const OUTCOME_TYPES = [
  "money_monthly",
  "money_yearly",
  "money_once",
  "time_hours",
  "binary",
] as const;

export function toOutcomeType(value: string | null | undefined): DetailStats["outcome_type"] {
  return (OUTCOME_TYPES as readonly string[]).includes(value ?? "")
    ? (value as DetailStats["outcome_type"])
    : null;
}

export { AMOUNT_THRESHOLD, REPORT_THRESHOLD };