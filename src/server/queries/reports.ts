import "server-only";

import { createClient } from "@/lib/supabase/server";
import { REPORT_THRESHOLD } from "@/server/queries/types";

/**
 * Approved reports for the detail page.
 *
 * Everything here reads `public_reports`, never `outcome_reports`. The view is
 * the only route to report data that anon is granted, and it is the one that
 * swaps `user_id` for a display name and an initial — so a query written against
 * the table directly would be a query that either fails on RLS or, once a
 * column grant were widened for it, starts shipping reporter identities to the
 * browser.
 */

/** One approved report as the page renders it. */
export type ReportRow = {
  id: string;
  result: "worked" | "partly" | "didnt";
  amount: number | string | null;
  unit: string | null;
  hours_saved: number | string | null;
  time_spent_bucket: string | null;
  provider: string | null;
  note: string | null;
  /** The reporter set this themselves — not a moderation decision. */
  is_verified: boolean;
  /** A moderator approved evidence attached to this report. See the migration. */
  evidence_reviewed: boolean;
  created_at: string;
  display_name: string;
  display_initial: string;
  agent_name: string | null;
  agent_slug: string | null;
};

/** Time-spent buckets, as the check constraint spells them. */
export const TIME_SPENT_LABELS: Record<string, string> = {
  lt15: "Under 15 min",
  "15_30": "15–30 min",
  "30_60": "30–60 min",
  "1_2h": "1–2 hours",
  "2h_plus": "Over 2 hours",
};

export function formatTimeSpent(bucket: string | null | undefined): string | null {
  if (!bucket) {
    return null;
  }
  return TIME_SPENT_LABELS[bucket] ?? null;
}

export type ReportFilters = {
  /** Agent slug the reader filtered to. */
  agentSlug?: string;
  result?: "worked" | "partly" | "didnt";
  /** The company the reporter dealt with, as filed. */
  provider?: string;
  limit?: number;
  offset?: number;
};

const DEFAULT_LIMIT = 5;

/**
 * Reports for one playbook, newest first.
 *
 * The agent filter runs on `agent_id`, not on the embedded agent's `slug`. That
 * is the same lesson as P5's category filter: PostgREST here does not reliably
 * apply a filter on an embedded resource's column, and when it does not it fails
 * silently — returning the unfiltered list under a filter the reader believes is
 * applied. The slug is resolved to an id first, and an unknown slug yields no
 * rows rather than all of them.
 */
export async function listReports(
  playbookId: string,
  filters: ReportFilters = {},
): Promise<{ rows: ReportRow[]; total: number }> {
  const supabase = await createClient();

  let query = supabase
    .from("public_reports")
    .select(
      `id, result, amount, unit, hours_saved, time_spent_bucket, provider, note,
       is_verified, evidence_reviewed, created_at, display_name, display_initial,
       agent:agents ( display_name, slug )`,
      { count: "exact" },
    )
    .eq("playbook_id", playbookId);

  if (filters.agentSlug) {
    const ids = await resolveAgentIds([filters.agentSlug]);
    if (ids.length === 0) {
      return { rows: [], total: 0 };
    }
    query = query.in("agent_id", ids);
  }

  if (filters.result) {
    query = query.eq("result", filters.result);
  }

  if (filters.provider) {
    query = query.eq("provider", filters.provider);
  }

  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .range(filters.offset ?? 0, (filters.offset ?? 0) + (filters.limit ?? DEFAULT_LIMIT) - 1);

  if (error) {
    throw new Error(`listReports: ${error.message}`);
  }

  const rows = (data ?? []) as unknown as ReportRow[];

  return {
    rows: rows.map((row) => normaliseAgent(row)),
    total: count ?? rows.length,
  };
}

function normaliseAgent(row: ReportRow): ReportRow {
  const agent = (row as { agent?: unknown }).agent as
    | { display_name: string; slug: string }
    | { display_name: string; slug: string }[]
    | null;
  const first = Array.isArray(agent) ? agent[0] : agent;
  return {
    ...row,
    agent_name: first?.display_name ?? null,
    agent_slug: first?.slug ?? null,
  };
}

/**
 * How many approved reports arrived in the last 30 days.
 *
 * This exists because `playbook_stats.last30_success` stores the rate without
 * the count it was computed from, and a 30-day percentage whose denominator is
 * unknown cannot be checked against the 20-report threshold. Counting here is
 * exact and cheap: the index is on (playbook_id, created_at desc).
 *
 * It queries `public_reports` rather than the stats row for that reason alone.
 */
export async function countReportsSince(
  playbookId: string,
  days: number,
  now = Date.now(),
): Promise<number> {
  const supabase = await createClient();
  const since = new Date(now - days * 86_400_000).toISOString();

  const { count, error } = await supabase
    .from("public_reports")
    .select("id", { count: "exact", head: true })
    .eq("playbook_id", playbookId)
    .gte("created_at", since);

  if (error) {
    throw new Error(`countReportsSince: ${error.message}`);
  }

  return count ?? 0;
}

/** Whether a 30-day figure can be shown at all. Re-exported so callers do not
 *  import the threshold from two places to answer one question. */
export function canShowLast30(reportsInLast30Days: number): boolean {
  return reportsInLast30Days >= REPORT_THRESHOLD;
}

/**
 * The distinct providers named in this playbook's approved reports.
 *
 * Derived from the reports rather than from `playbooks.report_fields`, because
 * the brief says the filter offers the companies reporters actually dealt with.
 * A report filed with no provider contributes nothing rather than an empty
 * option, which would render as a chip that filters to nothing.
 */
export async function listReportProviders(playbookId: string): Promise<string[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("public_reports")
    .select("provider")
    .eq("playbook_id", playbookId)
    .not("provider", "is", null);

  if (error) {
    throw new Error(`listReportProviders: ${error.message}`);
  }

  const seen = new Set<string>();
  for (const row of data ?? []) {
    const provider = (row.provider ?? "").trim();
    if (provider) {
      seen.add(provider);
    }
  }

  return [...seen].sort((a, b) => a.localeCompare(b));
}

async function resolveAgentIds(slugs: readonly string[]): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("agents").select("id").in("slug", [...slugs]);

  if (error) {
    throw new Error(`resolveAgentIds: ${error.message}`);
  }
  return (data ?? []).map((row) => row.id as string);
}