import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Agent, Category, Collection, UseCase } from "@/server/queries/types";

/** A category with the number of published playbooks in it. */
export type CategoryWithCount = Category & { playbook_count: number };

/**
 * Every category with its published-playbook count.
 *
 * Ordered by the `sort` column rather than alphabetically, so the order the
 * brief lists them in is the order they appear in. Counts come from a separate
 * query rather than a count embed because a count over an embedded filter is
 * both slow and hard to read against RLS.
 */
export async function listCategories(): Promise<CategoryWithCount[]> {
  const supabase = await createClient();

  const [{ data: categories, error }, { data: playbooks, error: countsError }] = await Promise.all([
    supabase.from("categories").select("id, slug, name, emoji, description, sort").order("sort"),
    supabase.from("playbooks").select("category_id").eq("status", "published"),
  ]);

  if (error) {
    throw new Error(`listCategories: ${error.message}`);
  }
  if (countsError) {
    throw new Error(`listCategories (counts): ${countsError.message}`);
  }

  const counts = new Map<string, number>();
  for (const row of playbooks ?? []) {
    counts.set(row.category_id, (counts.get(row.category_id) ?? 0) + 1);
  }

  return (categories ?? []).map((category) => ({
    ...category,
    playbook_count: counts.get(category.id) ?? 0,
  }));
}

/** One category by slug, or null. */
export async function getCategory(slug: string): Promise<Category | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("categories")
    .select("id, slug, name, emoji, description, sort")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    throw new Error(`getCategory(${slug}): ${error.message}`);
  }

  return data;
}

/**
 * Agents, split by whether the UI may offer them.
 *
 * `selectable` is the only list anything interactive may render from.
 * `coming_soon` renders as greyed, disabled chips with no label beyond the
 * agent's name — AGENTS.md is explicit that no "Coming soon" or "Script only"
 * text is wanted. `hidden` agents are omitted entirely, so a playbook authored
 * against one still resolves without the agent appearing anywhere.
 */
export async function listAgents(): Promise<{
  selectable: Agent[];
  coming_soon: Agent[];
}> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("agents")
    .select(
      "id, slug, display_name, vendor, prompt_format, launch_url_template, home_url, capabilities, status, sort",
    )
    .neq("status", "hidden")
    .order("sort");

  if (error) {
    throw new Error(`listAgents: ${error.message}`);
  }

  const rows = data ?? [];

  return {
    selectable: rows.filter((agent) => agent.status === "active"),
    coming_soon: rows.filter((agent) => agent.status === "coming_soon"),
  };
}

/**
 * The one selectable agent. v1 has exactly one (Muse), and it is preselected in
 * every try flow, so this is called far more often than a general list would be.
 */
export async function getPrimaryAgent(): Promise<Agent | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("agents")
    .select(
      "id, slug, display_name, vendor, prompt_format, launch_url_template, home_url, capabilities, status, sort",
    )
    .eq("status", "active")
    .order("sort")
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`getPrimaryAgent: ${error.message}`);
  }

  return data;
}

export type CollectionWithItems = Collection & { playbook_ids: string[] };

/**
 * A starter kit by slug, with its playbook ids in author order.
 *
 * Only the ids, not the playbooks: callers render them through `listPlaybooks`
 * so a kit page and a search page cannot describe the same playbook differently.
 */
export async function getCollection(slug: string): Promise<CollectionWithItems | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("collections")
    .select(
      `
        id, slug, title, blurb, illustration_url, is_featured, sort,
        items:collection_items ( playbook_id, sort )
      `,
    )
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    throw new Error(`getCollection(${slug}): ${error.message}`);
  }

  if (!data) {
    return null;
  }

  const { items, ...collection } = data;

  return {
    ...collection,
    playbook_ids: [...(items ?? [])]
      .sort((a, b) => a.sort - b.sort)
      .map((item) => item.playbook_id),
  };
}

/** Every starter kit, featured ones first. */
export async function listCollections(): Promise<CollectionWithItems[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("collections")
    .select(
      `
        id, slug, title, blurb, illustration_url, is_featured, sort,
        items:collection_items ( playbook_id, sort )
      `,
    )
    .order("is_featured", { ascending: false })
    .order("sort");

  if (error) {
    throw new Error(`listCollections: ${error.message}`);
  }

  return (data ?? []).map(({ items, ...collection }) => ({
    ...collection,
    playbook_ids: [...(items ?? [])].sort((a, b) => a.sort - b.sort).map((i) => i.playbook_id),
  }));
}

/** Kits marked `is_featured`, which is what the homepage renders. */
export async function listFeaturedCollections(): Promise<CollectionWithItems[]> {
  const collections = await listCollections();
  return collections.filter((collection) => collection.is_featured);
}

export type UseCaseWithItems = UseCase & { playbook_ids: string[] };

export async function getUseCase(slug: string): Promise<UseCaseWithItems | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("use_cases")
    .select(
      `
        id, slug, title, description, gradient_from, gradient_to, sort,
        items:use_case_items ( playbook_id, sort )
      `,
    )
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    throw new Error(`getUseCase(${slug}): ${error.message}`);
  }

  if (!data) {
    return null;
  }

  const { items, ...useCase } = data;

  return {
    ...useCase,
    playbook_ids: [...(items ?? [])].sort((a, b) => a.sort - b.sort).map((i) => i.playbook_id),
  };
}

/** Use cases, in the order the homepage carousel shows them. */
export async function listUseCases(): Promise<UseCaseWithItems[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("use_cases")
    .select(
      `
        id, slug, title, description, gradient_from, gradient_to, sort,
        items:use_case_items ( playbook_id, sort )
      `,
    )
    .order("sort");

  if (error) {
    throw new Error(`listUseCases: ${error.message}`);
  }

  return (data ?? []).map(({ items, ...useCase }) => ({
    ...useCase,
    playbook_ids: [...(items ?? [])].sort((a, b) => a.sort - b.sort).map((i) => i.playbook_id),
  }));
}