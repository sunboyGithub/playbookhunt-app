import { randomUUID } from "node:crypto";

import { adminClient } from "./db";
import { withDbLock } from "./lock";

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
 * Every address this suite creates an administrator out of.
 *
 * One prefix, checked in `clearPromotedAdmins`, so a promotion left behind by a
 * run that timed out is recognisable. The `@example.test` domain is the other
 * half of the guarantee: no real account can end up matching, because the
 * domain does not exist and GoTrue accepted it anyway.
 */
const ADMIN_PREFIX = "admin-";
const TEST_DOMAIN = "@example.test";

/**
 * Promote an account, exactly as `scripts/promote-admin.ts` does.
 *
 * The same single UPDATE. The script is the documented path for a person at a
 * terminal; running it from here would add a subprocess and an env-file
 * dependency to every run of this suite in order to execute one line of SQL.
 */
export async function promoteToAdmin(email: string): Promise<boolean> {
  const user = await idFor(email);
  if (!user) return false;

  // Only the write is locked. Looking the address up is a read, and holding a
  // cross-process lock across it makes the whole suite queue behind the slowest
  // `listUsers` — with ten workers on one database that is where the time goes,
  // and the symptom is an unrelated test giving up on the lock.
  return withDbLock(async () => {
    const { error } = await adminClient()!
      .from("profiles")
      .update({ role: "admin" })
      .eq("id", user);

    return error === null;
  });
}

/** Take the promotion away again, so a failed run does not leave an admin behind. */
export async function demote(email: string): Promise<void> {
  const user = await idFor(email);
  if (!user) return;

  await withDbLock(async () => {
    await adminClient()!.from("profiles").update({ role: "user" }).eq("id", user);
  });
}

/**
 * The profile id behind an address.
 *
 * `auth.users` is the only place an address lives — `profiles` is publicly
 * readable and must never hold one — so finding one means listing. Every test
 * that signs in has already created its account by the time this is called, so
 * the list is always up to date.
 */
async function idFor(email: string): Promise<string | null> {
  const supabase = adminClient();
  if (!supabase) return null;

  const { data } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });

  return data.users.find((candidate) => candidate.email === email)?.id ?? null;
}

/**
 * Demote every administrator a *previous* run promoted, and say how many.
 *
 * The `finally` in each test is not a reliable guarantee. Playwright abandons a
 * test body the moment it exceeds its timeout, so a test that timed out while
 * holding the database lock, or part-way through signing in, never reaches its
 * own cleanup — and the account stays an administrator on the local database
 * forever after.
 *
 * That is worse than untidy. The suite's first four tests assert that an
 * ordinary reader gets a **404** from `/admin`; an account left as an admin by an
 * earlier run is still an ordinary reader as far as the next test is concerned,
 * so it quietly gets 200 instead and the gate looks broken for a reason that has
 * nothing to do with the gate. Worse, which tests fail depends on which run
 * crashed — the failure moves around and looks like flakiness in the product.
 *
 * So the suite does not rely on its own cleanup surviving. This runs in
 * `beforeAll`, which Playwright does run, and starts every run from a known
 * state.
 *
 * Only addresses matching the suite's own prefix and the reserved test domain
 * are touched, so this cannot demote a real administrator even if somebody is
 * developing against a database that has one.
 */
export async function clearPromotedAdmins(): Promise<number> {
  const supabase = adminClient();
  if (!supabase) return 0;

  const { data } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const ids = data.users
    .filter((candidate) => {
      const email = candidate.email ?? "";
      return email.startsWith(ADMIN_PREFIX) && email.endsWith(TEST_DOMAIN);
    })
    .map((user) => user.id);

  if (ids.length === 0) return 0;

  // One statement rather than a loop: after a few crashed runs there can be
  // dozens of these, and `globalSetup` blocks the entire run.
  await withDbLock(async () => {
    await supabase.from("profiles").update({ role: "user" }).in("id", ids);
  });

  return ids.length;
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
 * rather than by its position — which is the only handle this report has on the
 * public side, because `ReportList` renders the result, amount, agent and date
 * but never a note.
 *
 * It is a `randomUUID` for the same reason `freshEmail` is: `Date.now()` alone
 * collides between two workers running the desktop and mobile projects at once,
 * and two reports sharing a sentinel text would make the queue assertions
 * ambiguous.
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

  const note = `e2e moderation sentinel ${randomUUID().slice(0, 8)}`;

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

  await withDbLock(async () => {
    await supabase.from("outcome_reports").delete().eq("id", id);
  });
}