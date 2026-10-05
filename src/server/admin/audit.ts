import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/lib/database.types";

/**
 * The only writer of `admin_actions`.
 *
 * ## Why the log is written by hand rather than by trigger
 *
 * A trigger on every moderated table would be genuinely tamper-proof and would
 * also be unreadable: it would have to know what "the reason this report was
 * rejected" is, for every table, including tables that arrive later. The actions
 * already know all three things — who, what, and why — and there are a bounded
 * number of them, so the honest version is one call at the end of each action
 * and a test that says so.
 *
 * The table itself is the structural half. `admin_actions` has no insert policy
 * and no insert grant for any client role, so even a forgotten call cannot be
 * supplemented by one a reader performs: the log can only ever be written from
 * the server. That covers tampering; the tests cover omission.
 *
 * ## Why a failed write does not undo the action
 *
 * An administrator who approves a report has done the thing. Refusing to render
 * "approved" afterwards — because the log insert hit a connection limit — would
 * show them an error, prompt a retry, and leave the report approved twice over
 * with two identical audit entries and a strong impression that nothing worked.
 *
 * So the mutation stands and the log entry is written to stderr. That trade is
 * recorded here rather than buried: a gap in the log is possible, it is loud,
 * and the alternative corrupts the action it is supposed to describe.
 */

export type AdminActionEntry = {
  /** A dotted verb: `report.approve`, `playbook.edit`, `request.plan`. */
  action: string;
  /**
   * What it was done to, in the form the action already holds. A slug where there
   * is one, an id where there is not — and never a foreign key, because the log
   * has to outlive the row.
   */
  target: string;
  /**
   * What happened, in enough detail to reconstruct it.
   *
   * Deliberately *not* free text the caller typed where a reader could read it:
   * a moderation note stays out of here for the same reason it stays out of the
   * public report view — the log is read by other administrators, which makes it
   * a smaller room, not an empty one.
   */
  payload?: Record<string, unknown>;
};

/**
 * Record one action. Returns whether it was recorded.
 *
 * Never throws. See the header for why, and read the return value if you are
 * writing a test for a queue that matters.
 */
export async function writeAdminAction(
  client: Pick<SupabaseClient<Database>, "from">,
  adminId: string,
  entry: AdminActionEntry,
): Promise<boolean> {
  const { error } = await client.from("admin_actions").insert({
    admin_id: adminId,
    action: entry.action,
    target: entry.target,
    // The column is `not null`, so the cast is to the non-null half of `Json`
    // rather than to `Json` itself — which would happily admit the `null` that
    // this exact line is avoiding.
    payload: (entry.payload ?? {}) as NonNullable<Json>,
  });

  if (error) {
    console.error(`[admin] audit write failed for ${entry.action} on ${entry.target}:`, error.message);
    return false;
  }

  return true;
}

/**
 * One row, for the log view. The payload is `Json`, so this is the place it
 * becomes something renderable — and the narrowing is where a missing key turns
 * into "—" rather than into `undefined` reaching the DOM.
 */
export type AuditEntry = {
  id: string;
  adminId: string;
  adminName: string | null;
  action: string;
  target: string;
  payload: Record<string, unknown>;
  createdAt: string;
};

type AuditRow = Database["public"]["Tables"]["admin_actions"]["Row"];

/**
 * The most recent entries, newest first.
 *
 * Capped, and said so in the function name's callers: an audit log with no limit
 * is a page that stops rendering, and a moderation area that will not load is
 * worse than one showing the last week.
 */
export async function listAuditEntries(
  client: Pick<SupabaseClient<Database>, "from">,
  limit = 100,
): Promise<AuditEntry[]> {
  const { data, error } = await client
    .from("admin_actions")
    .select("id, admin_id, action, target, payload, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`listAuditEntries: ${error.message}`);
  }

  const rows = (data ?? []) as AuditRow[];
  if (rows.length === 0) {
    return [];
  }

  // The names are resolved in one query rather than one per row: an audit log
  // read at 100 rows would otherwise be 100 round trips to render a list.
  const adminIds = [...new Set(rows.map((row) => row.admin_id))];
  const { data: profiles } = await client
    .from("profiles")
    .select("id, display_name")
    .in("id", adminIds);

  const nameById = new Map((profiles ?? []).map((row) => [row.id, row.display_name]));

  return rows.map((row) => ({
    id: row.id,
    adminId: row.admin_id,
    adminName: nameById.get(row.admin_id) ?? null,
    action: row.action,
    target: row.target,
    payload: (row.payload ?? {}) as Record<string, unknown>,
    createdAt: row.created_at,
  }));
}