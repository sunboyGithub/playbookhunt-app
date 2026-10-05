import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import { type VersionContent } from "@/server/queries/playbooks";

/**
 * Reading playbooks for the admin area.
 *
 * ## Why the list does not reuse the public query
 *
 * `listPlaybooks` filters to `status = 'published'` and sorts by evidence,
 * because that is what a reader is owed. An administrator is owed the opposite:
 * every status, including the drafts that will never appear anywhere else, and a
 * stable order they can find things in. The two lists overlap and agree on
 * nothing, so they are separate reads rather than a flag on one query.
 *
 * The detail read takes the *type* from `getVersionContent` — the prompt,
 * inputs, steps, agents and sources of a version are the same facts whoever is
 * reading them — but not the function. That one reads through the RLS client,
 * which hides draft content, and the content an administrator is most often
 * editing is the content that is not published yet. So the read is written out
 * here against the administrator's own client and typed as the same shape; see
 * `getVersionContentWith`.
 */

type AdminClient = Pick<SupabaseClient<Database>, "from">;

export type AdminPlaybookListItem = {
  id: string;
  slug: string;
  title: string;
  status: string;
  categoryName: string;
  lastVerifiedAt: string | null;
  reportCount: number;
  triedCount: number;
  evidenceScore: number;
  updatedAt: string;
};

/** `as const` so the generated types can parse it — see the note in `reports.ts`. */
const LIST_SELECT = `
  id, slug, title, status, last_verified_at, updated_at,
  category:categories ( name ),
  stats:playbook_stats ( report_count, tried_count, evidence_score )
` as const;

export async function listAdminPlaybooks(
  client: AdminClient,
  status?: string,
): Promise<AdminPlaybookListItem[]> {
  let query = client
    .from("playbooks")
    .select(LIST_SELECT)
    // `in_review` is excluded, and always — including from the "any" tab.
    //
    // It is not an oversight that this list is not the whole table. A submission
    // is not half-finished admin content: its decision lives in
    // `playbook_submissions`, its reviewer note has an audience of one creator,
    // and the core editor here cannot even represent its status. Listing it twice
    // would put a row in this table that opens a form which refuses to save.
    // `/admin/submissions` is the one place a submission appears.
    .neq("status", "in_review")
    .order("updated_at", { ascending: false })
    .limit(500);

  if (status && status !== "any") {
    query = query.eq("status", status);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`listAdminPlaybooks: ${error.message}`);
  }

  return (data ?? []).map((row) => {
    const category = one(row.category);
    const stats = one(row.stats);

    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      status: row.status,
      categoryName: category?.name ?? "",
      lastVerifiedAt: row.last_verified_at,
      // A playbook with no reports has no stats row at all, which is the honest
      // state: `report_count` would be 0 either way, and the null here is what
      // lets the editor tell "no reports yet" from "reports counted, none counted".
      reportCount: stats?.report_count ?? 0,
      triedCount: stats?.tried_count ?? 0,
      evidenceScore: Number(stats?.evidence_score ?? 0),
      updatedAt: row.updated_at,
    };
  });
}

export type AdminPlaybookDetail = {
  id: string;
  slug: string;
  title: string;
  promise: string;
  whoFor: string | null;
  whoNotFor: string | null;
  status: string;
  previewImageUrl: string | null;
  lastVerifiedAt: string | null;
  timeMin: number | null;
  timeMax: number | null;
  authorId: string | null;
  authorName: string | null;
  currentVersion: VersionContent | null;
};

/** The editable core fields, for the playbook editor. */
const DETAIL_SELECT = `
  id, slug, title, promise, who_for, who_not_for, status, preview_image_url,
  last_verified_at, time_min, time_max, author_id, current_version_id,
  author:profiles ( display_name )
` as const;

export async function getAdminPlaybook(
  client: AdminClient,
  id: string,
): Promise<AdminPlaybookDetail | null> {
  const { data, error } = await client
    .from("playbooks")
    .select(DETAIL_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`getAdminPlaybook(${id}): ${error.message}`);
  }

  if (!data) {
    return null;
  }

  const author = one(data.author);

  return {
    id: data.id,
    slug: data.slug,
    title: data.title,
    promise: data.promise,
    whoFor: data.who_for,
    whoNotFor: data.who_not_for,
    status: data.status,
    previewImageUrl: data.preview_image_url,
    lastVerifiedAt: data.last_verified_at,
    timeMin: data.time_min,
    timeMax: data.time_max,
    authorId: data.author_id,
    authorName: author?.display_name ?? null,
    // The RLS client cannot read a draft version, so this is read with the
    // caller's admin client rather than with `createClient()`. Which means the
    // shared helper cannot be used as-is — see `getVersionContentWith`.
    currentVersion: await getVersionContentWith(client, data.current_version_id),
  };
}

/**
 * A version's content, read with whatever client the caller has.
 *
 * `getVersionContent` reads through the RLS client, which hides draft content —
 * correct for the public site, wrong for the editor, because the content an
 * administrator is most often editing is the content that is not published yet.
 */
async function getVersionContentWith(
  client: AdminClient,
  versionId: string | null,
): Promise<VersionContent | null> {
  if (!versionId) {
    return null;
  }

  const { data, error } = await client
    .from("playbook_versions")
    .select(
      `id, playbook_id, version, prompt_template, changelog, created_at,
       inputs:playbook_inputs!playbook_inputs_version_id_fkey (
         id, key, label, help, why_it_helps, type, options, required, sort
       ),
       steps:playbook_steps!playbook_steps_version_id_fkey ( id, sort, body )`,
    )
    .eq("id", versionId)
    .maybeSingle();

  if (error) {
    throw new Error(`getVersionContentWith(${versionId}): ${error.message}`);
  }

  if (!data) {
    return null;
  }

  const [{ data: agentRows }, { data: sourceRows }] = await Promise.all([
    client
      .from("playbook_agents")
      .select("tested, notes, agent:agents ( slug, display_name, status )")
      .eq("playbook_id", data.playbook_id),
    client
      .from("playbook_sources")
      .select("id, platform, handle, url, title")
      .eq("playbook_id", data.playbook_id),
  ]);

  return {
    id: data.id,
    version: data.version,
    prompt_template: data.prompt_template,
    changelog: data.changelog,
    created_at: data.created_at,
    inputs: [...(data.inputs ?? [])].sort((a, b) => a.sort - b.sort),
    steps: [...(data.steps ?? [])].sort((a, b) => a.sort - b.sort),
    agents: (agentRows ?? []).map((row) => {
      const agent = (Array.isArray(row.agent) ? row.agent[0] : row.agent)!;
      return {
        slug: agent.slug,
        display_name: agent.display_name,
        status: agent.status,
        tested: row.tested,
        notes: row.notes,
      };
    }),
    sources: [...(sourceRows ?? [])],
  };
}

/**
 * Slug and title of every playbook, for the pickers that arrange collections and
 * use cases.
 *
 * Every status, not only published ones, and the picker labels the difference.
 * The person arranging a list is usually choosing between things still being
 * written — that is when a kit needs rearranging — and hiding the drafts from
 * them means the playbook they had in mind is simply absent, with no way to tell
 * "I forgot to write this one" from "it does not exist". The public pages are
 * where a draft must not appear, and they read published content only.
 */
export async function listPlaybookOptions(
  client: AdminClient,
): Promise<{ id: string; slug: string; title: string; status: string }[]> {
  const { data, error } = await client
    .from("playbooks")
    .select("id, slug, title, status")
    .order("title");

  if (error) {
    throw new Error(`listPlaybookOptions: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    status: row.status,
  }));
}

/** Every version of one playbook, newest first — the editor's history list. */
export async function listVersions(
  client: AdminClient,
  playbookId: string,
): Promise<{ id: string; version: number; changelog: string | null; createdAt: string; isCurrent: boolean }[]> {
  const [{ data, error }, { data: playbook }] = await Promise.all([
    client
      .from("playbook_versions")
      .select("id, version, changelog, created_at")
      .eq("playbook_id", playbookId)
      .order("version", { ascending: false }),
    client.from("playbooks").select("current_version_id").eq("id", playbookId).maybeSingle(),
  ]);

  if (error) {
    throw new Error(`listVersions(${playbookId}): ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    version: row.version,
    changelog: row.changelog,
    createdAt: row.created_at,
    isCurrent: row.id === playbook?.current_version_id,
  }));
}

function one<T>(value: T | T[] | null): T | null {
  if (value === null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}