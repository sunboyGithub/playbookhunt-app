import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  AMOUNT_THRESHOLD,
  PROVEN_MIN_EVIDENCE_APPROVED,
  REPORT_THRESHOLD,
  type ListPlaybooksFilters,
  type PlaybookWithRelations,
  type SortOption,
} from "@/server/queries/types";

/**
 * Columns every playbook row needs. Kept in one place so a card, a detail page
 * and a search result all describe a playbook identically.
 *
 * The agents embed names its foreign key explicitly. There are two paths from
 * playbooks to agents — the `primary_agent_id` column and the `playbook_agents`
 * join table — and with both present PostgREST cannot infer which one an
 * unqualified `agents` embed means. It raises rather than guessing, which is the
 * right behaviour: the alternative is guessing the join table and silently
 * attaching the wrong agent to every card.
 *
 * Nothing resembling a SQL comment may appear inside this string; a `--` in a
 * PostgREST select is a parse error.
 */
const PLAYBOOK_SELECT = `
  id, slug, title, promise, category_id, status, who_for, who_not_for,
  time_min, time_max, outcome_type, outcome_unit, required_capability,
  report_fields, followup_days, preview_image_url, primary_agent_id,
  author_id, current_version_id, last_verified_at, tags, created_at, updated_at,
  category:categories ( id, slug, name, emoji, description, sort ),
  primary_agent:agents!playbooks_primary_agent_id_fkey ( id, slug, display_name, vendor, home_url, capabilities, status ),
  stats:playbook_stats (
    tried_count, report_count, worked, partly, didnt, success_rate_raw,
    wilson_lb, median_amount, p25, p75, amount_n, last30_success,
    evidence_score, trending_score, last_report_at, updated_at
  )
` as const;

export type PlaybookRow = Awaited<ReturnType<typeof fetchPlaybooks>>[number];

/** Untyped shape of one selected playbook, before the cast to the exported type. */
async function fetchPlaybooks(slugFilter?: string) {
  const supabase = await createClient();

  let query = supabase.from("playbooks").select(PLAYBOOK_SELECT).eq("status", "published");
  if (slugFilter) {
    query = query.eq("slug", slugFilter);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`playbooks query: ${error.message}`);
  }
  return (data ?? []) as unknown[];
}

/**
 * A published playbook by slug, with its current version's content.
 *
 * Returns null for a draft or archived playbook rather than throwing: the RLS
 * policy already hides those from anon, and "not found" is the right answer for
 * a page route either way.
 */
export async function getPublishedPlaybookBySlug(slug: string) {
  const rows = (await fetchPlaybooks(slug)) as PlaybookWithRelations[];

  if (rows.length === 0) {
    return null;
  }

  const playbook = rows[0]!;
  const content = await getVersionContent(playbook.current_version_id);

  return { ...playbook, current_version: content };
}

export type VersionContent = {
  id: string;
  version: number;
  prompt_template: string;
  changelog: string | null;
  created_at: string;
  inputs: {
    id: string;
    key: string;
    label: string;
    help: string | null;
    why_it_helps: string | null;
    type: string;
    options: unknown;
    required: boolean;
    sort: number;
  }[];
  steps: { id: string; sort: number; body: string }[];
  agents: {
    slug: string;
    display_name: string;
    status: string;
    tested: boolean;
    notes: string | null;
  }[];
  sources: {
    id: string;
    platform: string;
    handle: string | null;
    url: string | null;
    title: string | null;
  }[];
};

/**
 * The prompt, inputs, steps, agent links and sources for one version.
 *
 * Inputs and steps hang off the version, but agent links and sources hang off
 * the *playbook* — a new version does not re-list which agents it works with or
 * who inspired it. So those two come from a second query keyed on the version's
 * playbook_id, rather than being nested into the same select.
 *
 * Nested one-to-many selects come back in whatever order Postgres returns them,
 * so each list is sorted here rather than relying on the wire format.
 */
export async function getVersionContent(versionId: string | null): Promise<VersionContent | null> {
  if (!versionId) {
    return null;
  }

  const supabase = await createClient();

  // The FK names are spelled out because PostgREST cannot always infer an embed,
  // and when it cannot it returns null for the whole row rather than raising —
  // which silently costs the reader their prompt. Nothing resembling a SQL
  // comment is allowed inside the select string for the same reason.
  const { data, error } = await supabase
    .from("playbook_versions")
    .select(
      `id, playbook_id, version, prompt_template, changelog, created_at,
       inputs:playbook_inputs!playbook_inputs_version_id_fkey (
         id, key, label, help, why_it_helps, type, options, required, sort
       ),
       steps:playbook_steps!playbook_steps_version_id_fkey ( id, sort, body )`,
    )
    .eq("id", versionId)
    .maybeSingle();

  if (error) {
    throw new Error(`getVersionContent(${versionId}): ${error.message}`);
  }

  if (!data) {
    return null;
  }

  const [{ data: agentRows, error: agentsError }, { data: sourceRows, error: sourcesError }] =
    await Promise.all([
      supabase
        .from("playbook_agents")
        .select("tested, notes, agent:agents ( slug, display_name, status )")
        .eq("playbook_id", data.playbook_id),
      supabase
        .from("playbook_sources")
        .select("id, platform, handle, url, title")
        .eq("playbook_id", data.playbook_id),
    ]);

  if (agentsError) {
    throw new Error(`getVersionContent (agents): ${agentsError.message}`);
  }
  if (sourcesError) {
    throw new Error(`getVersionContent (sources): ${sourcesError.message}`);
  }

  return {
    id: data.id,
    version: data.version,
    prompt_template: data.prompt_template,
    changelog: data.changelog,
    created_at: data.created_at,
    inputs: [...(data.inputs ?? [])].sort((a, b) => a.sort - b.sort),
    steps: [...(data.steps ?? [])].sort((a, b) => a.sort - b.sort),
    agents: (agentRows ?? []).map((row) => {
      // PostgREST returns an embedded to-one relation as an object or a
      // one-element array depending on version; normalise to the object.
      const agent = (Array.isArray(row.agent) ? row.agent[0] : row.agent)!;
      return {
        slug: agent.slug,
        display_name: agent.display_name,
        status: agent.status,
        tested: row.tested,
        notes: row.notes,
      };
    }),
    sources: [...(sourceRows ?? [])],
  };
}

/**
 * Published playbooks matching the given filters, sorted by evidence.
 *
 * Sorting happens in JS rather than in the query. PostgREST cannot order by an
 * embedded resource, and the alternative — denormalising evidence_score onto
 * playbooks — would put the ranking output in two places that could disagree.
 * The whole catalogue is ~48 rows in v1, so the cost of doing it here is
 * negligible and the alternative is a second source of truth.
 */
export async function listPlaybooks(
  filters: ListPlaybooksFilters = {},
  sort: SortOption = "best_evidence",
): Promise<PlaybookWithRelations[]> {
  const supabase = await createClient();

  let query = supabase.from("playbooks").select(PLAYBOOK_SELECT).eq("status", "published");

  if (filters.categorySlug) {
    query = query.eq("category.slug", filters.categorySlug);
  }

  if (filters.agentSlug) {
    query = query.eq("primary_agent.slug", filters.agentSlug);
  }

  if (filters.outcomeGroup === "save_money") {
    query = query.in("outcome_type", ["money_monthly", "money_yearly", "money_once"]);
  } else if (filters.outcomeGroup === "save_time") {
    query = query.eq("outcome_type", "time_hours");
  } else if (filters.outcomeGroup === "other") {
    query = query.eq("outcome_type", "binary");
  }

  if (filters.verifiedWithinDays !== undefined) {
    const since = new Date(Date.now() - filters.verifiedWithinDays * 86_400_000).toISOString();
    query = query.gte("last_verified_at", since);
  }

  if (filters.maxTimeMinutes !== undefined) {
    query = query.lte("time_min", filters.maxTimeMinutes);
  }

  // Membership in a collection or use case is a join, not a column, so those two
  // filters run as a subquery on the joined id.
  if (filters.collectionSlug || filters.useCaseSlug) {
    const ids = await resolveMembershipIds(filters);
    if (ids.length === 0) {
      return [];
    }
    query = query.in("id", ids);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`listPlaybooks: ${error.message}`);
  }

  const rows = (data ?? []) as unknown as PlaybookWithRelations[];

  const filtered = rows.filter((row) => {
    // These filters read an embedded resource, which is why they cannot be
    // expressed in the query above.
    if (filters.minReports !== undefined && (row.stats?.report_count ?? 0) < filters.minReports) {
      return false;
    }
    return true;
  });

  const sorted = sortPlaybooks(filtered, sort);
  const offset = filters.offset ?? 0;
  const limit = filters.limit ?? 24;

  return sorted.slice(offset, offset + limit);
}

/**
 * Ordering for the results page.
 *
 * Each comparison is null-safe: a playbook with no stats row sorts last rather
 * than throwing or, worse, sorting as zero and beating a genuinely untested
 * playbook. `highest_outcome` additionally falls back to evidence below the
 * amount threshold, because a median computed from three amounts is not a
 * median the UI is allowed to show.
 */
export function sortPlaybooks(
  rows: PlaybookWithRelations[],
  sort: SortOption,
): PlaybookWithRelations[] {
  const by = (pick: (row: PlaybookWithRelations) => number | string | null | undefined) =>
    [...rows].sort((a, b) => compare(pick(a), pick(b)));

  switch (sort) {
    case "most_tried":
      return by((row) => row.stats?.tried_count ?? null);
    case "trending":
      return by((row) => row.stats?.trending_score ?? null);
    case "recently_verified":
      return by((row) => row.last_verified_at);
    case "highest_outcome":
      return [...rows].sort((a, b) => {
        const aMedian = a.stats?.median_amount;
        const bMedian = b.stats?.median_amount;
        const aHas = (a.stats?.amount_n ?? 0) >= AMOUNT_THRESHOLD && aMedian !== null;
        const bHas = (b.stats?.amount_n ?? 0) >= AMOUNT_THRESHOLD && bMedian !== null;
        // Playbooks without a reportable median fall back to evidence order
        // rather than being pushed to the bottom or ranked on a number the UI
        // will not display.
        if (aHas !== bHas) {
          return aHas ? -1 : 1;
        }
        if (aHas && bHas) {
          return compare(aMedian, bMedian);
        }
        return compare(a.stats?.evidence_score ?? null, b.stats?.evidence_score ?? null);
      });
    case "best_evidence":
    default:
      return by((row) => row.stats?.evidence_score ?? null);
  }
}

/** Descending, with nulls last. Nulls are last rather than first because an
 *  unmeasured playbook should never outrank a measured one. */
function compare(a: number | string | null | undefined, b: number | string | null | undefined): number {
  const left = a ?? null;
  const right = b ?? null;
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  if (typeof left === "string" || typeof right === "string") {
    return String(right).localeCompare(String(left));
  }
  return right - left;
}

async function resolveMembershipIds(filters: ListPlaybooksFilters): Promise<string[]> {
  const supabase = await createClient();

  if (filters.collectionSlug) {
    const { data } = await supabase
      .from("collection_items")
      .select("playbook_id, collections!inner ( slug )")
      .eq("collections.slug", filters.collectionSlug);
    return [...new Set((data ?? []).map((row) => row.playbook_id))];
  }

  if (filters.useCaseSlug) {
    const { data } = await supabase
      .from("use_case_items")
      .select("playbook_id, use_cases!inner ( slug )")
      .eq("use_cases.slug", filters.useCaseSlug);
    return [...new Set((data ?? []).map((row) => row.playbook_id))];
  }

  return [];
}

/**
 * Page size used where a query must see every published row rather than one
 * page of them. The catalogue is ~48 rows in v1, so this is generous rather
 * than exact, and it is a floor for correctness, not a display limit.
 */
const CATALOGUE_PAGE = 500;

/**
 * Playbooks eligible for the homepage's "Proven to work" row.
 *
 * AGENTS.md's bar is at least 20 reports *and* at least 3 evidence-approved
 * reports. playbook_stats has no evidence count, so this counts approved
 * evidence directly rather than adding a column nothing else reads.
 */
export async function listProvenPlaybooks(limit = 3): Promise<PlaybookWithRelations[]> {
  const supabase = await createClient();

  const { data: withEvidence, error } = await supabase
    .from("outcome_reports")
    .select("playbook_id, id, report_evidence!inner ( id )")
    .eq("report_evidence.review_status", "approved");

  if (error) {
    throw new Error(`listProvenPlaybooks (evidence): ${error.message}`);
  }

  // Count approved evidence per playbook. A playbook can have several reports
  // each with evidence, and every one of them counts towards the bar.
  const evidenceCount = new Map<string, number>();
  for (const report of withEvidence ?? []) {
    const rows = Array.isArray(report.report_evidence)
      ? report.report_evidence
      : [report.report_evidence];
    evidenceCount.set(
      report.playbook_id,
      (evidenceCount.get(report.playbook_id) ?? 0) + rows.length,
    );
  }

  const evidenceQualified = [...evidenceCount.entries()]
    .filter(([, count]) => count >= PROVEN_MIN_EVIDENCE_APPROVED)
    .map(([playbookId]) => playbookId);

  if (evidenceQualified.length === 0) {
    return [];
  }

  // The eligible set is small but its members are not necessarily the
  // highest-ranked ones, so this asks for a page large enough to hold the whole
  // catalogue. Filtering a default page instead would quietly drop any proven
  // playbook that happens to rank below the cut — the exact case this row exists
  // to surface.
  const rows = await listPlaybooks({ limit: CATALOGUE_PAGE }, "best_evidence");

  // Both halves of the bar, checked here rather than assumed. AGENTS.md requires
  // at least 20 reports *and* at least 3 evidence-approved reports, and evidence
  // count alone does not imply report count — three screenshots on one report is
  // three evidence rows and one report. Filtering on evidence alone would put a
  // five-report playbook under a heading that promises proven.
  return rows
    .filter(
      (row) =>
        evidenceQualified.includes(row.id) &&
        (row.stats?.report_count ?? 0) >= REPORT_THRESHOLD,
    )
    .slice(0, limit);
}

/**
 * Recently verified playbooks, used as the fallback row when fewer than three
 * clear the "Proven to work" bar. Labelled differently at the call site so a
 * lesser-evidence row is never presented as proven.
 */
export async function listRecentlyVerifiedPlaybooks(limit = 3): Promise<PlaybookWithRelations[]> {
  const rows = await listPlaybooks({ verifiedWithinDays: 30 }, "recently_verified");
  return rows.slice(0, limit);
}

/**
 * Whether the report threshold is met, i.e. whether a success percentage may be
 * shown at all. Every call site should go through this rather than checking
 * `report_count >= 20` inline, so the threshold is stated in exactly one place.
 */
export function canShowSuccessRate(reportCount: number | null | undefined): boolean {
  return (reportCount ?? 0) >= REPORT_THRESHOLD;
}