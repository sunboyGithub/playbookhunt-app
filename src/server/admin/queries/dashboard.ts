import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";

/**
 * What the /admin landing page shows.
 *
 * ## The six counts
 *
 * Three of them are "how much has happened lately" and three are "how much is
 * waiting for me", and they are kept apart because they answer different
 * questions. A founder opening the dashboard is asking either "is the site
 * working" or "do I have anything to do", and one number that tried to answer
 * both — a single total of reports, say — answers neither: 400 reports this week
 * and zero in the queue is a good month, and 4 reports and 4 pending is a
 * problem, and they look identical as a total.
 *
 * Every count is a `head: true` query rather than a `fetch`. The rows behind
 * them are the busiest tables in the product and none of them is needed; a
 * dashboard that read a thousand try events to say "1,180 tries this week" would
 * be slower than the moderation queue it sits above.
 */

const WEEK_MS = 7 * 24 * 3_600_000;

export type AdminDashboard = {
  publishedPlaybooks: number;
  triesThisWeek: number;
  reportsThisWeek: number;
  pendingReports: number;
  pendingEvidence: number;
  openRequests: number;
  topByEvidence: RankedPlaybook[];
  topByTrending: RankedPlaybook[];
};

export type RankedPlaybook = {
  slug: string;
  title: string;
  evidenceScore: number;
  trendingScore: number;
  reportCount: number;
  triedCount: number;
};

type AdminClient = Pick<SupabaseClient<Database>, "from">;

/**
 * One count, or a throw naming the count.
 *
 * A failed count and a count of zero look the same on the dashboard, and "there
 * is nothing to review" is the answer a moderator acts on — so this refuses to
 * return one it did not get.
 */
async function head(
  query: PromiseLike<{ count: number | null; error: { message: string } | null }>,
  label: string,
): Promise<number> {
  const { count: total, error } = await query;

  if (error) {
    throw new Error(`admin dashboard — ${label}: ${error.message}`);
  }

  return total ?? 0;
}

export async function loadDashboard(client: AdminClient): Promise<AdminDashboard> {
  const since = new Date(Date.now() - WEEK_MS).toISOString();

  const counts = { count: "exact", head: true } as const;

  const [
    publishedPlaybooks,
    triesThisWeek,
    reportsThisWeek,
    pendingReports,
    pendingEvidence,
    openRequests,
    byEvidence,
    byTrending,
  ] = await Promise.all([
    head(client.from("playbooks").select("*", counts).eq("status", "published"), "published playbooks"),
    head(client.from("try_events").select("*", counts).gte("created_at", since), "tries this week"),
    head(
      client.from("outcome_reports").select("*", counts).gte("created_at", since),
      "reports this week",
    ),
    head(client.from("outcome_reports").select("*", counts).eq("status", "pending"), "pending reports"),
    head(
      client.from("report_evidence").select("*", counts).eq("review_status", "pending"),
      "pending evidence",
    ),
    head(client.from("playbook_requests").select("*", counts).eq("status", "new"), "open requests"),
    ranked(client, "evidence_score"),
    ranked(client, "trending_score"),
  ]);

  return {
    publishedPlaybooks,
    triesThisWeek,
    reportsThisWeek,
    pendingReports,
    pendingEvidence,
    openRequests,
    topByEvidence: byEvidence,
    topByTrending: byTrending,
  };
}

/**
 * The top five by one ordering.
 *
 * Two calls rather than one: a single query cannot return the top five by two
 * different orderings of the same rows, and a dashboard showing one beside the
 * other would be inviting the reader to compare them as if they were the same
 * list. They are not — one is the ranking the site publishes and the other is
 * what people are clicking on this week, and the gap between them is the most
 * useful thing on this page.
 */
async function ranked(client: AdminClient, column: "evidence_score" | "trending_score") {
  const { data, error } = await client
    .from("playbook_stats")
    .select("evidence_score, trending_score, report_count, tried_count, playbooks!inner(slug, title)")
    .order(column, { ascending: false })
    .limit(5);

  if (error) {
    throw new Error(`admin dashboard — ranking by ${column}: ${error.message}`);
  }

  return (data ?? []).map((row) => {
    // `!inner` guarantees the join matched, so `playbooks` is one row here; the
    // generated type widens it, because a select *string* cannot be narrowed at
    // the type level. A placeholder title beats crashing the dashboard over it.
    const playbook = (row.playbooks as unknown as { slug?: string; title?: string } | null) ?? {};

    return {
      slug: playbook.slug ?? "(unpublished)",
      title: playbook.title ?? "Untitled playbook",
      evidenceScore: Number(row.evidence_score ?? 0),
      trendingScore: Number(row.trending_score ?? 0),
      reportCount: row.report_count ?? 0,
      triedCount: row.tried_count ?? 0,
    };
  });
}