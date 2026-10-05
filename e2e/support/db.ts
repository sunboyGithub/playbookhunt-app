/**
 * Read-only database access for the e2e suite.
 *
 * Two things need it, and neither can be reached through the browser:
 *
 * - `try_events` grants select to admins only, so the anon key the app itself
 *   uses cannot confirm that the copy button logged anything.
 * - The evidence thresholds are a rule about *counts*. A test can assert that a
 *   percentage is withheld, but not that withholding it was correct unless it can
 *   read how many reports actually exist.
 *
 * Service role, and read-only by usage — with one deliberate exception. Almost
 * nothing here writes: the one function that does is marked `mutating`, and it
 * exists because P9's acceptance criterion is about the *order* search results
 * come back in, which cannot be asserted without moving a number.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "../../src/lib/database.types";

/**
 * `undefined` means "not looked up yet", `null` means "looked up and unavailable".
 * Distinguishing them is what lets the env file load once instead of on every
 * call, while still letting a suite run without it.
 */
let cached: SupabaseClient<Database> | null | undefined;

/**
 * A service-role client, or null when the keys are not available.
 *
 * `.env.local` is loaded lazily rather than at module scope so a run without it
 * still executes every test that does not need it, instead of failing to import.
 */
export function adminClient(): SupabaseClient<Database> | null {
  if (cached !== undefined) {
    return cached;
  }

  try {
    process.loadEnvFile(".env.local");
  } catch {
    // No `.env.local` — this run only has the app's public keys.
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  cached =
    url && key ? createClient<Database>(url, key, { auth: { persistSession: false } }) : null;

  return cached;
}

/** How many approved reports each of these slugs has. Empty when unavailable. */
export async function reportCountsBySlug(
  slugs: readonly string[],
): Promise<Map<string, number>> {
  const supabase = adminClient();
  const counts = new Map<string, number>();

  if (!supabase) {
    return counts;
  }

  const { data: playbooks } = await supabase
    .from("playbooks")
    .select("id, slug")
    .in("slug", [...slugs]);

  if (!playbooks || playbooks.length === 0) {
    return counts;
  }

  const { data: reports } = await supabase
    .from("outcome_reports")
    .select("playbook_id")
    .in(
      "playbook_id",
      playbooks.map((row) => row.id as string),
    );

  for (const row of reports ?? []) {
    const slug = playbooks.find((playbook) => playbook.id === row.playbook_id)?.slug;
    if (slug) {
      counts.set(slug, (counts.get(slug) ?? 0) + 1);
    }
  }

  return counts;
}

/** `action` values on `try_events` for one playbook since an ISO timestamp. */
export async function copiedActionsSince(slug: string, since: string): Promise<string[]> {
  return copiedActionsFor(null, slug, since);
}

/**
 * The same, narrowed to one reader.
 *
 * Narrowing matters when the suite runs in parallel: every project copies the
 * same playbook, so "somebody logged a copy" is not "this reader logged a copy",
 * and a test that conflates the two passes on the other project's row.
 */
export async function copiedActionsFor(
  email: string | null,
  slug: string,
  since: string,
): Promise<string[]> {
  const supabase = adminClient();
  if (!supabase) {
    return [];
  }

  const { data: playbook } = await supabase
    .from("playbooks")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  if (!playbook) {
    return [];
  }

  let query = supabase
    .from("try_events")
    .select("action")
    .eq("playbook_id", playbook.id)
    .eq("action", "copied")
    .gte("created_at", since);

  if (email) {
    const userId = await authUserId(email);
    // A reader we cannot resolve is not a reader whose rows we may assume.
    if (!userId) {
      return [];
    }
    query = query.eq("user_id", userId);
  }

  const { data } = await query;

  return (data ?? []).map((row) => row.action as string);
}

/**
 * Addresses already resolved in this worker process.
 *
 * An address's `auth.users` id never changes, so once this process has seen the
 * list it never has to fetch it again for an address it already knows. That
 * matters more than it looks: `copiedActionsFor` is called from inside `toPass`
 * retry loops, so before this cache every retry of "wait for the copy to be
 * logged" transferred the whole user table. Under five workers on one Postgres
 * that was the single largest source of load in the suite, and it showed up as
 * those loops timing out rather than as anything resembling a product bug.
 *
 * A miss always re-fetches, so an account created after the first call is still
 * found — nothing is cached negatively.
 */
const resolvedAddresses = new Map<string, string>();

/**
 * The `auth.users` id for an address, or null.
 *
 * There is no lookup by address in the admin API, so this pages the list. The
 * page size is the maximum the endpoint accepts, which keeps a suite that has
 * created a few hundred test accounts down to a single round trip.
 *
 * **This is page 1 only, and that is a real limit.** Once the local database
 * passes 1000 accounts the addresses a test just created fall off the end of the
 * first page and this quietly starts returning `null` — which
 * `copiedActionsFor` turns into an empty array, so a test fails as "nothing was
 * logged" when the copy *was* logged. The local stack was at 229 accounts. The
 * fix is to look users up by id (the sign-in helpers already have the id) or to
 * prune the table between runs; both are test-infrastructure work that belongs
 * with this function rather than smuggled into a feature milestone.
 */
export async function authUserId(email: string): Promise<string | null> {
  const cached = resolvedAddresses.get(email);
  if (cached !== undefined) {
    return cached;
  }

  const supabase = adminClient();
  if (!supabase) {
    return null;
  }

  const { data } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const id = data.users.find((user) => user.email === email)?.id ?? null;

  if (id !== null) {
    resolvedAddresses.set(email, id);
  }

  return id;
}
/* -------------------------------------------------------------------------- */
/* The one write                                                              */
/* -------------------------------------------------------------------------- */

/**
 * What `pinEvidenceScores` changed, so it can be undone exactly.
 *
 * Two lists rather than one map of nullable scores, because "the score was null"
 * and "there was no row" need different undos: one is an update, the other is a
 * delete.
 */
export type PinnedScores = {
  /** Slugs whose existing score has to be written back. */
  scores: Record<string, number>;
  /** Slugs that had no stats row, so the row this helper made must be removed. */
  rowsCreated: string[];
};

/** Slug ↔ id, resolved once and cached; the catalogue does not change mid-run. */
const slugCache = new Map<string, string>();

async function playbookIdFor(slug: string): Promise<string> {
  const supabase = adminClient();
  if (!supabase) return "";

  const cached = slugCache.get(slug);
  if (cached) return cached;

  const { data, error } = await supabase
    .from("playbooks")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  if (error) throw new Error(`looking up ${slug}: ${error.message}`);

  // A slug that resolved to nothing would go into the write as `undefined`,
  // which PostgREST rejects with a confusing complaint about a uuid.
  if (!data) throw new Error(`no playbook with slug ${slug} — run pnpm content:import`);

  slugCache.set(slug, String(data.id));
  return String(data.id);
}

/**
 * **Mutating.** Read current scores, then pin them to the given values.
 *
 * The only way to assert "results are ordered by evidence score" is to have two
 * playbooks whose scores are in a known order and check which comes first — and
 * both seeded playbooks have real reports, so their scores come out of
 * `aggregate()` in whatever order the arithmetic produces. Pinning them makes
 * the expectation explicit and independent of that.
 *
 * Pinned to values no aggregation would produce (0.9 and 0.1, not two near
 * neighbours), so a failure cannot be explained by the rules having shifted
 * slightly. Hand the return value to `restoreEvidenceScores` in a `finally`:
 * leaving a developer's database with a fabricated ranking is worse than a
 * failed test, and it is exactly the state the seed script used to be able to
 * leave behind.
 */
export async function pinEvidenceScores(pinned: Record<string, number>): Promise<PinnedScores> {
  const supabase = adminClient();
  if (!supabase) return { scores: {}, rowsCreated: [] };

  const slugs = Object.keys(pinned);
  const ids = await Promise.all(slugs.map(playbookIdFor));

  const { data, error: readError } = await supabase
    .from("playbook_stats")
    .select("playbook_id, evidence_score")
    .in("playbook_id", ids);

  if (readError) throw new Error(`reading stats for ${slugs.join(", ")}: ${readError.message}`);

  const scoreById = new Map<string, number>(
    (data ?? []).map((row) => [String(row.playbook_id), Number(row.evidence_score)]),
  );

  // What `previous` records is not "the old score" but "what to do to get back".
  // A playbook whose stats row did not exist needs its row deleted, not zeroed:
  // a zeroed row is something the aggregation job would have written, and
  // leaving one behind invents a fact about a playbook that has no reports.
  const previous: PinnedScores = { scores: {}, rowsCreated: [] };

  slugs.forEach((slug, index) => {
    const score = scoreById.get(ids[index]!);
    if (score === undefined) previous.rowsCreated.push(slug);
    else previous.scores[slug] = score;
  });

  const { error: writeError } = await supabase
    .from("playbook_stats")
    .upsert(
      slugs.map((slug, index) => ({ playbook_id: ids[index]!, evidence_score: pinned[slug]! })),
      { onConflict: "playbook_id" },
    );

  if (writeError) throw new Error(`pinning evidence scores: ${writeError.message}`);

  return previous;
}

/** Undo `pinEvidenceScores`, from the value it returned. */
export async function restoreEvidenceScores(previous: PinnedScores): Promise<void> {
  const supabase = adminClient();
  if (!supabase) return;

  for (const [slug, score] of Object.entries(previous.scores)) {
    const { error } = await supabase
      .from("playbook_stats")
      .update({ evidence_score: score })
      .eq("playbook_id", await playbookIdFor(slug));

    if (error) throw new Error(`restoring the score for ${slug}: ${error.message}`);
  }

  for (const slug of previous.rowsCreated) {
    const { error } = await supabase
      .from("playbook_stats")
      .delete()
      .eq("playbook_id", await playbookIdFor(slug));

    if (error) throw new Error(`removing the invented stats row for ${slug}: ${error.message}`);
  }
}
