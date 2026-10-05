import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";

/**
 * The requests inbox.
 *
 * ## Where the grouping happens
 *
 * In Postgres, in `admin_request_inbox` (migration 13), and nowhere else. The
 * function returns a `group_key` per row — the earliest earlier request it
 * resembles — and this file's whole job is to fold rows sharing a key into one
 * line.
 *
 * Doing the similarity in TypeScript instead would be the second opinion about
 * "are these two requests the same request" that P9 spent its whole budget
 * removing from the ranking. The grouping decides what the founder builds next,
 * so it belongs to the database's trigram index and to a pgTAP test that can
 * assert it groups and does not over-group.
 */

/** Below this, two strings stop being the same request. See migration 13. */
export const DEFAULT_SIMILARITY = 0.55;

type AdminClient = Pick<SupabaseClient<Database>, "rpc" | "from">;

export type RequestRow = {
  id: string;
  query: string;
  email: string | null;
  topic: string | null;
  purpose: string | null;
  pathname: string | null;
  createdAt: string;
  status: string;
  decidedAt: string | null;
};

/**
 * One line in the inbox: a request, plus how many times it has been asked for.
 *
 * `others` is the other copies, newest last, and it is the point of the view —
 * "1 request" and "14 people asked for this" are different things to act on,
 * and collapsing them into one count would throw away the second.
 */
export type RequestGroup = RequestRow & {
  count: number;
  others: RequestRow[];
};

export async function listRequestGroups(
  client: AdminClient,
  minSimilarity: number = DEFAULT_SIMILARITY,
): Promise<RequestGroup[]> {
  const { data, error } = await client.rpc("admin_request_inbox", {
    min_similarity: minSimilarity,
  });

  if (error) {
    throw new Error(`listRequestGroups: ${error.message}`);
  }

  const rows = (data ?? []) as unknown as {
    id: string;
    query: string;
    email: string | null;
    topic: string | null;
    purpose: string | null;
    pathname: string | null;
    created_at: string;
    status: string;
    decided_at: string | null;
    group_key: string;
  }[];

  const groups = new Map<string, RequestRow[]>();

  for (const row of rows) {
    const item: RequestRow = {
      id: row.id,
      query: row.query,
      email: row.email,
      topic: row.topic,
      purpose: row.purpose,
      pathname: row.pathname,
      createdAt: row.created_at,
      status: row.status,
      decidedAt: row.decided_at,
    };

    const existing = groups.get(row.group_key);
    if (existing) existing.push(item);
    else groups.set(row.group_key, [item]);
  }

  // The representative is the oldest member, which is what the SQL guarantees by
  // filing each row under the earliest earlier request it resembles. Sorting by
  // date here is therefore not a choice — it is restating what the function did,
  // in case a future edit to the query changes that.
  return [...groups.values()]
    .map((members) => {
      const sorted = [...members].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
      const [representative, ...others] = sorted;

      return { ...representative!, count: sorted.length, others };
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/** The counts behind the inbox's status tabs. */
export async function countRequestsByStatus(
  client: AdminClient,
): Promise<Record<string, number>> {
  const { data, error } = await client.from("playbook_requests").select("status");

  if (error) {
    throw new Error(`countRequestsByStatus: ${error.message}`);
  }

  const counts: Record<string, number> = { new: 0, planned: 0, done: 0 };

  for (const row of data ?? []) {
    const status = row.status ?? "new";
    counts[status] = (counts[status] ?? 0) + 1;
  }

  return counts;
}