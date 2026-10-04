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
 * Service role, and read-only by usage. Nothing here writes.
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

  const { data } = await supabase
    .from("try_events")
    .select("action")
    .eq("playbook_id", playbook.id)
    .eq("action", "copied")
    .gte("created_at", since);

  return (data ?? []).map((row) => row.action as string);
}