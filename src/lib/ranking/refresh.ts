/**
 * Turning database rows into `playbook_stats`.
 *
 * This module is deliberately the *only* place that knows how a column in
 * `outcome_reports` becomes a number in `playbook_stats`. Everything about what
 * those numbers mean lives in `aggregate.ts`, which is pure and tested without a
 * database; everything here is translation, and it is tested by the pgTAP suite
 * and by the end-to-end assertion that the search order actually moves.
 *
 * ## A single-playbook refresh still reads the whole catalogue
 *
 * `refreshPlaybookStats(id)` sounds like it should read one row. It does not,
 * and the reason is the shape of the score: two of its four terms are defined
 * *relative to other playbooks* — `usage` is a share of the busiest playbook on
 * the site, and `outcomeStrength` is a percentile within the category. Computing
 * one playbook's evidence score without knowing what the others look like would
 * write it onto a different scale than every row written before it, and the
 * ordering would quietly change under the catalogue.
 *
 * So the absolute terms come from one playbook's rows and the relative terms
 * come from everybody. What the single-playbook path saves is the *write* — one
 * upsert instead of the catalogue's — which is what matters, because the reads
 * are bounded queries and the writes are the part that has to wait for a
 * transaction.
 *
 * ## Why the evidence score, not the whole row, decides revalidation
 *
 * A page is revalidated when the number a reader will see has moved. Trending
 * moves on a clock with nobody filing anything, so it is deliberately *not* in
 * the comparison — otherwise every cron run would revalidate every page and the
 * cache would be doing nothing.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { AMOUNT_CAPS } from "@/lib/report/shape";
import { aggregate, applyRelativeTerms, type Reporter } from "@/lib/ranking/aggregate";
import type {
  AggregatedStats,
  Badge,
  PeerStat,
  RankablePlaybook,
  RankableReport,
  RankableTry,
} from "@/lib/ranking/types";
import type { Database } from "@/lib/database.types";

/** A guard on the read queries, not a plan. The catalogue is small today. */
const MAX_ROWS = 20_000;

/**
 * Rows per request.
 *
 * PostgREST caps a response at 1000 rows and silently truncates — no error, no
 * warning, just a shorter list. That is the most dangerous kind of wrong answer
 * for a ranking job: `try_events` is the busiest table in the product and the
 * one whose count is published on every card, so a page size over 1000 would
 * make "1,180 people tried this" render as "1,000" and nobody would find out.
 *
 * This is why the reads below page rather than fetching once. It was found by
 * the seed: 1,180 devices came back as exactly 1,000, and the two quieter
 * playbooks came back as nothing at all because their rows sat past the cut.
 */
const PAGE_ROWS = 1_000;

const PLAYBOOK_COLUMNS = "id, slug, category_id, outcome_type, author_id, last_verified_at";
const REPORT_COLUMNS =
  "id, playbook_id, user_id, result, amount, hours_saved, status, is_outlier, evidence_reviewed, created_at";
const TRY_COLUMNS = "playbook_id, user_id, device_id, action, created_at";

type Row = Record<string, unknown>;

/**
 * `timestamptz` as PostgREST wants it.
 *
 * Ranking hands dates back as `Date` — the normalised form every function in it
 * expects — and this is the one place that converts to the string the database
 * takes. An unparseable value becomes null rather than the string "Invalid
 * Date", which Postgres would reject outright and take the whole batch down
 * with it.
 */
function toIso(value: Date | string | null): string | null {
  if (value === null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Postgres `numeric` arrives as a string when it is not exactly representable. */
function num(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : null;
}

/* -------------------------------------------------------------------------- */
/* Row → ranking shapes                                                        */
/* -------------------------------------------------------------------------- */

/**
 * The playbook columns ranking reads, from one row.
 *
 * `amountCap` comes from `AMOUNT_CAPS` rather than from a stored column, so
 * the ceiling a report is judged against is the same constant the report form
 * used when it accepted the number. A stored cap would be a second place to
 * change it and a way for the two to disagree.
 *
 * An `outcome_type` that is missing or unrecognised falls back to `binary`,
 * which has a cap of zero and no comparable amount. That is the conservative
 * direction: the playbook loses its outcome term rather than being scored
 * against an exchange rate between hours and dollars that nobody supplied.
 */
export function toRankablePlaybook(row: Row): RankablePlaybook {
  const outcomeType = (row.outcome_type ?? "binary") as RankablePlaybook["outcomeType"];

  return {
    id: String(row.id),
    slug: String(row.slug),
    categoryId: String(row.category_id),
    outcomeType,
    authorId: (row.author_id as string | null) ?? null,
    lastVerifiedAt: (row.last_verified_at as string | null) ?? null,
    amountCap: AMOUNT_CAPS[outcomeType] ?? 0,
  };
}

/**
 * `outcome_reports` → `RankableReport`.
 *
 * `hasApprovedEvidence` reads `outcome_reports.evidence_reviewed` rather than
 * joining `report_evidence`. That column exists for exactly this purpose —
 * migration 06 added it because the evidence table has no public select policy
 * at all, and the denormalised flag is what moderation writes when it approves
 * a row. Joining the evidence table instead would give the product two sources
 * of truth for one fact, and the disagreement would be silent: a report whose
 * evidence was approved would display the "Evidence reviewed" tag from the
 * column while contributing nothing to `evidence_approved`, so "Proven to work"
 * would need 3 that the page insists exist.
 *
 * The two reporter fields are placeholders. The caller overwrites them from the
 * profiles map, which is the only place `email_verified` lives; leaving them
 * readable here is what stops a future caller from quietly shipping a report
 * weighted as if its author were unverified.
 */
export function toRankableReport(row: Row): RankableReport {
  return {
    id: String(row.id),
    reporterId: String(row.user_id),
    result: row.result as RankableReport["result"],
    amount: num(row.amount),
    hoursSaved: num(row.hours_saved),
    status: row.status as RankableReport["status"],
    isOutlier: row.is_outlier === true,
    hasApprovedEvidence: row.evidence_reviewed === true,
    reporterEmailVerified: false,
    reporterCreatedAt: new Date(0).toISOString(),
    createdAt: (row.created_at as string | null) ?? new Date(0).toISOString(),
  };
}

export function toRankableTry(row: Row): RankableTry {
  return {
    userId: (row.user_id as string | null) ?? null,
    deviceId: String(row.device_id ?? ""),
    action: row.action as RankableTry["action"],
    createdAt: (row.created_at as string | null) ?? new Date(0).toISOString(),
  };
}

/**
 * `AggregatedStats` → the columns of `playbook_stats`.
 *
 * `lastVerifiedAt` is *not* written here. It is a column on `playbooks` — the
 * date somebody last confirmed the playbook still works is a fact about the
 * playbook, and copying it onto the stats row would give two places to disagree
 * about it. The score reads the playbook's copy.
 *
 * `badges` goes over as a plain array; the constraint added in migration 11 is
 * what rejects an unrecognised value, so a typo fails here rather than reaching
 * a card that has no case for it.
 */
export type StatsRow = Database["public"]["Tables"]["playbook_stats"]["Insert"];

/**
 * Enough of a Supabase client for this module.
 *
 * A structural type rather than `SupabaseClient<Database>`, because the seed
 * script builds its own client and the generated `Database` generic makes
 * otherwise-identical clients incompatible — which would push the seed script
 * back to casting, and a cast is exactly the kind of thing that lets a renamed
 * column through silently in a script whose whole job is writing plausible rows.
 */export type StatsClient = Pick<
  SupabaseClient<Database>,
  "from"
>;

export function toStatsRow(playbookId: string, stats: AggregatedStats): StatsRow {
  return {
    playbook_id: playbookId,
    tried_count: stats.triedCount,
    report_count: stats.reportCount,
    worked: stats.worked,
    partly: stats.partly,
    didnt: stats.didnt,
    success_rate_raw: stats.successRateRaw,
    weighted_success: stats.weightedSuccess,
    wilson_lb: stats.wilsonLowerBound,
    median_amount: stats.medianAmount,
    p25: stats.p25,
    p75: stats.p75,
    amount_n: stats.amountN,
    last30_success: stats.last30Success,
    // `lastReportAt` is a `Date` because ranking normalises dates to `Date`
    // internally; PostgREST wants the ISO string it will store as timestamptz.
    last_report_at: toIso(stats.lastReportAt),
    evidence_score: stats.evidenceScore,
    trending_score: stats.trendingScore,
    evidence_approved: stats.evidenceApproved,
    show_rate: stats.showRate,
    show_median: stats.showMedian,
    strongest_eligible: stats.strongestEligible,
    badges: stats.badges as Badge[],
  };
}

/* -------------------------------------------------------------------------- */
/* Reading                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Read every matching row, a page at a time.
 *
 * Stops on a short page rather than on a row count, so the loop terminates
 * whatever the table size, and `MAX_ROWS` stays a hard ceiling so a bug in the
 * paging cannot become an unbounded read against a production database.
 *
 * Each caller's filters are applied before this is handed the query, which is
 * why the parameter is the builder itself rather than a table and a column
 * list: the generated types are per-table, and a generic helper over them would
 * need the very casts this file is written to avoid.
 */
async function readPaged(
  label: string,
  query: { range(from: number, to: number): PromiseLike<{ data: unknown; error: { message: string } | null }> },
): Promise<Row[]> {
  const rows: Row[] = [];

  for (let from = 0; from < MAX_ROWS; from += PAGE_ROWS) {
    const { data, error } = await query.range(from, from + PAGE_ROWS - 1);
    if (error) throw new Error(`refresh: reading ${label} failed — ${error.message}`);

    const page = (data ?? []) as Row[];
    rows.push(...page);

    if (page.length < PAGE_ROWS) break;
  }

  return rows;
}

function groupByPlaybook(rows: readonly Row[]): Map<string, Row[]> {
  const byPlaybook = new Map<string, Row[]>();
  for (const row of rows) {
    const key = String(row.playbook_id);
    const list = byPlaybook.get(key);
    if (list) list.push(row);
    else byPlaybook.set(key, [row]);
  }
  return byPlaybook;
}

/** Every playbook ranking reads, keyed by id. */
async function readPlaybooks(supabase: StatsClient): Promise<Map<string, Row>> {
  const rows = await readPaged(
    "playbooks",
    supabase.from("playbooks").select(PLAYBOOK_COLUMNS).order("id"),
  );

  return new Map(rows.map((row) => [String(row.id), row]));
}

async function readReports(
  supabase: StatsClient,
  playbookIds: readonly string[],
): Promise<Map<string, Row[]>> {
  if (playbookIds.length === 0) return new Map();

  const rows = await readPaged(
    "outcome reports",
    supabase
      .from("outcome_reports")
      .select(REPORT_COLUMNS)
      .in("playbook_id", playbookIds)
      // A stable order across pages. Without one, two pages of the same query
      // can overlap or skip rows at the boundary, which shows up as a median
      // that wobbles between two runs of the same data.
      .order("id"),
  );

  return groupByPlaybook(rows);
}

async function readTries(
  supabase: StatsClient,
  playbookIds: readonly string[],
): Promise<Map<string, Row[]>> {
  if (playbookIds.length === 0) return new Map();

  const rows = await readPaged(
    "try events",
    supabase
      .from("try_events")
      .select(TRY_COLUMNS)
      .in("playbook_id", playbookIds)
      .order("id"),
  );

  return groupByPlaybook(rows);
}

/** Trust facts for the profiles the reports name. */
async function readReporters(
  supabase: StatsClient,
  reporterIds: readonly string[],
): Promise<Map<string, Reporter>> {
  if (reporterIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from("profiles")
    .select("id, email_verified, created_at")
    .in("id", reporterIds);

  if (error) throw new Error(`refresh: reading profiles failed — ${error.message}`);

  return new Map(
    (data ?? []).map((row) => [
      String(row.id),
      {
        id: String(row.id),
        emailVerified: row.email_verified === true,
        createdAt: (row.created_at as string | null) ?? new Date(0).toISOString(),
      },
    ]),
  );
}

/** The evidence scores currently stored, so `changed` can mean what it says. */
async function readStoredScores(
  supabase: StatsClient,
  playbookIds: readonly string[],
): Promise<Map<string, number>> {
  if (playbookIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from("playbook_stats")
    .select("playbook_id, evidence_score")
    .in("playbook_id", playbookIds);

  if (error) throw new Error(`refresh: reading existing stats failed — ${error.message}`);

  return new Map(
    (data ?? []).map((row) => [
      String(row.playbook_id),
      num((row as Row).evidence_score) ?? 0,
    ]),
  );
}

/* -------------------------------------------------------------------------- */
/* The jobs                                                                    */
/* -------------------------------------------------------------------------- */

export type RefreshResult = {
  /** Rows written. */
  refreshed: number;
  /** Slugs whose evidence score moved — what the caller should revalidate. */
  changed: string[];
  /** Slugs whose stats were written for the first time. */
  created: string[];
};

/**
 * Recompute `playbook_stats`, for one playbook or for all of them.
 *
 * A score is "changed" past a tolerance rather than exactly, because the terms
 * are sums of exponentials and the last bit of one is not a fact a page's cache
 * should be invalidated for. The tolerance is far below any difference a reader
 * could see — the smallest possible step in a rendered percentile is a whole
 * percent of a score in [0, 1].
 */
const SCORE_EPSILON = 1e-6;

/**
 * Recompute stats for `playbookId`, or for every playbook when it is omitted.
 *
 * Returns the slugs whose score changed. A caller revalidating pages wants that
 * list rather than the count, because revalidating a page whose number did not
 * move is pure cost.
 */
export async function refreshStats(
  supabase: StatsClient,
  playbookId?: string,
): Promise<RefreshResult> {
  const playbooks = await readPlaybooks(supabase);

  const targetRows = playbookId
    ? [playbooks.get(playbookId)].filter((row): row is Row => row !== undefined)
    : [...playbooks.values()];

  if (targetRows.length === 0) {
    return { refreshed: 0, changed: [], created: [] };
  }

  // The relative terms are defined against the whole catalogue, so the reads
  // cover every playbook even when only one row is being written. See the header.
  const allIds = [...playbooks.keys()];
  const reportsByPlaybook = await readReports(supabase, allIds);
  const triesByPlaybook = await readTries(supabase, allIds);

  const allReportRows = [...reportsByPlaybook.values()].flat();
  const reporters = await readReporters(
    supabase,
    [...new Set(allReportRows.map((row) => String(row.user_id)))],
  );

  const rankablePlaybooks = new Map<string, RankablePlaybook>();
  const now = new Date();

  /* ---------------------------------------------- pass 1: absolute terms */

  const absolute = new Map<string, AggregatedStats>();

  for (const [id, row] of playbooks) {
    const playbook = toRankablePlaybook(row);
    rankablePlaybooks.set(id, playbook);

    const reports = (reportsByPlaybook.get(id) ?? []).map((reportRow) => {
      const report = toRankableReport(reportRow);
      const reporter = reporters.get(report.reporterId);
      // Trust comes from the profiles map, never from the report row. A report
      // whose author we cannot resolve still counts — it just cannot be
      // weighted by facts we do not have.
      return reporter
        ? { ...report, reporterEmailVerified: reporter.emailVerified, reporterCreatedAt: reporter.createdAt }
        : report;
    });

    const reporterRows = [
      ...new Set(reports.map((report) => report.reporterId)),
    ]
      .map((reporterId) => reporters.get(reporterId))
      .filter((reporter): reporter is Reporter => reporter !== undefined);

    absolute.set(
      id,
      aggregate(
        {
          playbook,
          reports,
          reporters: reporterRows,
          tries: (triesByPlaybook.get(id) ?? []).map(toRankableTry),
        },
        now,
      ),
    );
  }

  /* --------------------------------------- pass 2: the peer-relative half */

  const catalogue: PeerStat[] = [...absolute].map(([playbookId, stats]) => {
    const playbook = rankablePlaybooks.get(playbookId)!;
    return {
      playbookId,
      categoryId: playbook.categoryId,
      outcomeType: playbook.outcomeType,
      medianAmount: stats.medianAmount,
      amountN: stats.amountN,
      triedCount: stats.triedCount,
      wilsonLowerBound: stats.wilsonLowerBound,
      weightedSuccess: stats.weightedSuccess ?? 0,
    };
  });

  const maxTried = catalogue.reduce((max, peer) => Math.max(max, peer.triedCount), 0);

  const targetIds = targetRows.map((row) => String(row.id));
  const before = await readStoredScores(supabase, targetIds);

  const rows: StatsRow[] = [];
  const changed: string[] = [];
  const created: string[] = [];

  for (const id of targetIds) {
    const stats = absolute.get(id);
    const playbook = rankablePlaybooks.get(id);
    if (!stats || !playbook) continue;

    const relative = applyRelativeTerms(
      {
        playbookId: id,
        categoryId: playbook.categoryId,
        outcomeType: playbook.outcomeType,
        medianAmount: stats.medianAmount,
        amountN: stats.amountN,
        triedCount: stats.triedCount,
        wilsonLowerBound: stats.wilsonLowerBound,
        lastVerifiedAt: playbook.lastVerifiedAt,
      },
      catalogue,
      maxTried,
      now,
    );

    const merged: AggregatedStats = {
      ...stats,
      evidenceScore: relative.evidenceScore,
      badges: relative.badges,
    };

    rows.push(toStatsRow(id, merged));

    const previous = before.get(id);
    if (previous === undefined) {
      created.push(playbook.slug);
    } else if (Math.abs(previous - merged.evidenceScore) > SCORE_EPSILON) {
      changed.push(playbook.slug);
    }
  }

  if (rows.length === 0) {
    return { refreshed: 0, changed: [], created: [] };
  }

  // One statement for the whole batch. The row is keyed on `playbook_id`, so an
  // upsert is the only write that can be correct for both a playbook whose
  // stats row already exists and one being written for the first time.
  const { error } = await supabase
    .from("playbook_stats")
    .upsert(rows, { onConflict: "playbook_id" });

  if (error) throw new Error(`refresh: writing stats failed — ${error.message}`);

  return { refreshed: rows.length, changed, created };
}