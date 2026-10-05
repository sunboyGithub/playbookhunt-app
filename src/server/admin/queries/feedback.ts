import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";

/**
 * The tester feedback queue.
 *
 * AGENTS.md puts private tester feedback in v1 and it is the last piece of the
 * admin area with no queue of its own. The rules that make it safe are already in
 * the schema from P1 — anyone may submit, only an admin may read, and `pathname`
 * is stored with query strings and fragments stripped — so nothing here changes
 * what is stored, only who looks at it.
 *
 * Feedback never reaches ranking. Nothing in `src/lib/ranking/` reads this table,
 * and the queue below is the only place in the app that mentions it.
 */

type AdminClient = Pick<SupabaseClient<Database>, "from">;

export const FEEDBACK_STATUSES = ["new", "reviewed", "closed"] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

export type FeedbackItem = {
  id: string;
  message: string;
  email: string | null;
  pathname: string | null;
  status: FeedbackStatus;
  createdAt: string;
};

export async function listFeedback(
  client: AdminClient,
  status?: FeedbackStatus,
): Promise<FeedbackItem[]> {
  let query = client
    .from("feedback")
    .select("id, message, email, pathname, status, created_at")
    .order("created_at", { ascending: false })
    .limit(200);

  if (status) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`listFeedback: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    message: row.message,
    email: row.email,
    pathname: row.pathname,
    status: isFeedbackStatus(row.status) ? row.status : "new",
    createdAt: row.created_at,
  }));
}

export async function countFeedbackByStatus(client: AdminClient): Promise<Record<string, number>> {
  const { data, error } = await client.from("feedback").select("status");

  if (error) {
    throw new Error(`countFeedbackByStatus: ${error.message}`);
  }

  const counts: Record<string, number> = { new: 0, reviewed: 0, closed: 0 };

  for (const row of data ?? []) {
    const status = row.status ?? "new";
    counts[status] = (counts[status] ?? 0) + 1;
  }

  return counts;
}

function isFeedbackStatus(value: string): value is FeedbackStatus {
  return value === "new" || value === "reviewed" || value === "closed";
}