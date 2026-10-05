import { adminClient } from "./db";

/**
 * The two writes P10's e2e suite needs, both of them things a browser cannot do.
 *
 * Everything else in the admin area is exercised through the UI on purpose. What
 * is left over after that is exactly what the UI deliberately does not offer:
 * making somebody an administrator, and putting a report into the queue in the
 * state a moderator will find it in.
 *
 * Both helpers do the same thing as something that ships — `promoteToAdmin` is
 * the one line `scripts/promote-admin.ts` runs, and `queuePendingReport` stands
 * in for the submission flow with moderation switched on. They are here rather
 * than in `db.ts` because `db.ts` is read-only by usage and this file is where
 * that exception is named.
 */

/**
 * Promote an account, exactly as `scripts/promote-admin.ts` does.
 *
 * The same single UPDATE. The script is the documented path for a person at a
 * terminal; running it from here would add a subprocess and an env-file
 * dependency to every run of this suite in order to execute one line of SQL.
 */
export async function promoteToAdmin(email: string): Promise<boolean> {
  const supabase = adminClient();
  if (!supabase) return false;

  const { data } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const user = data.users.find((candidate) => candidate.email === email);
  if (!user) return false;

  const { error } = await supabase.from("profiles").update({ role: "admin" }).eq("id", user.id);

  return error === null;
}

/** Take the promotion away again, so a failed run does not leave an admin behind. */
export async function demote(email: string): Promise<void> {
  const supabase = adminClient();
  if (!supabase) return;

  const { data } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const user = data.users.find((candidate) => candidate.email === email);
  if (!user) return;

  await supabase.from("profiles").update({ role: "user" }).eq("id", user.id);
}

export type QueuedReport = {
  id: string;
  slug: string;
  note: string;
};

/**
 * A report sitting in the queue, unreviewed.
 *
 * Inserted as pending rather than approved, because that is the only state the
 * moderation queue has anything to do about — and inserted here rather than
 * filed through the UI because the UI files reports as approved, which would
 * mean the test had nothing to moderate.
 *
 * The note is a sentinel so the row can be found in the queue by its own text
 * rather than by its position, and so the public page can be checked for exactly
 * this report and no other.
 */
export async function queuePendingReport(slug: string, userId: string): Promise<QueuedReport | null> {
  const supabase = adminClient();
  if (!supabase) return null;

  const { data: playbook } = await supabase
    .from("playbooks")
    .select("id, current_version_id")
    .eq("slug", slug)
    .maybeSingle();

  if (!playbook?.current_version_id) return null;

  const note = `e2e moderation sentinel ${Date.now().toString(36)}`;

  const { data: report, error } = await supabase
    .from("outcome_reports")
    .insert({
      playbook_id: playbook.id,
      version_id: playbook.current_version_id,
      user_id: userId,
      result: "worked",
      note,
      status: "pending",
    })
    .select("id")
    .single();

  if (error || !report) return null;

  return { id: report.id, slug, note };
}

export async function deleteReport(id: string): Promise<void> {
  const supabase = adminClient();
  if (!supabase) return;

  await supabase.from("outcome_reports").delete().eq("id", id);
}