import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";

/**
 * The `try_events` insert, separated from the server action around it.
 *
 * `logTryEvent` needs `cookies()` and a session, so it can only run inside a
 * Next request. The insert itself needs neither — it is an ordinary RLS-checked
 * write — and the rules that matter live in the insert: `user_id` set from the
 * session when there is one, `agent_id` resolved from a slug rather than
 * trusted from the client, and no prompt content of any kind.
 *
 * So the write takes the client it is given and does nothing else. That is what
 * lets the integration test drive this exact function with a real anon-key
 * client and a real signed-in client against local Supabase, rather than
 * asserting against a copy of the logic that could drift from it.
 */

export type TryEventAction = "started" | "copied" | "opened";

/** The client shape both the server action and the test use. */
export type TryEventClient = SupabaseClient<Database>;

export type TryEventRow = {
  playbookId: string;
  versionId?: string | null;
  /** Resolved to an id here; a caller only ever holds a slug. */
  agentSlug?: string | null;
  /** From the session. Null for an anonymous reader. */
  userId?: string | null;
  deviceId: string;
  action: TryEventAction;
};

/**
 * An agent's id, or null.
 *
 * Resolved by slug so that a caller cannot attribute a try event to an agent by
 * guessing a uuid, and so that a slug for an agent that no longer exists
 * records "no agent" rather than failing the insert.
 */
async function agentIdFor(
  supabase: TryEventClient,
  slug: string | null | undefined,
): Promise<string | null> {
  if (!slug) {
    return null;
  }

  const { data } = await supabase.from("agents").select("id").eq("slug", slug).maybeSingle();

  return (data?.id as string | undefined) ?? null;
}

/**
 * Insert one try event. Returns its id, or null if the write did not land.
 *
 * Never throws. This runs in the background of an interaction the reader is
 * already completing; a failed insert must not surface as an error on a page
 * that has otherwise worked, and letting it reject would turn a copy button into
 * a thing that can fail visibly.
 */
export async function insertTryEvent(
  supabase: TryEventClient,
  row: TryEventRow,
): Promise<{ id: string | null }> {
  if (!row.playbookId) {
    return { id: null };
  }

  // Generated here rather than read back, and that is load-bearing.
  //
  // `try_events` grants SELECT to admins only, by design: a visitor must not be
  // able to read what anyone logged. So the obvious `.insert(...).select("id")`
  // is a trap — it asks PostgREST for the inserted row, which re-reads it under
  // the SELECT policy, and the whole insert fails with a 42501 that looks like
  // "you may not log a try". The row was never the problem.
  //
  // Minting the id client-side keeps the write to exactly one statement and
  // needs no read at all. The column has a default for the paths that do not
  // care about the id; this path does, because it hands the id to the follow-up
  // that the try creates.
  const id = crypto.randomUUID();

  const { error } = await supabase.from("try_events").insert({
    id,
    playbook_id: row.playbookId,
    version_id: row.versionId ?? null,
    agent_id: await agentIdFor(supabase, row.agentSlug),
    // Set when someone is signed in, null otherwise. The column is nullable
    // precisely so an anonymous try is still countable; P8's "Tried" tab
    // joins on this.
    user_id: row.userId ?? null,
    device_id: row.deviceId,
    action: row.action,
  });

  if (error) {
    return { id: null };
  }

  return { id };
}
