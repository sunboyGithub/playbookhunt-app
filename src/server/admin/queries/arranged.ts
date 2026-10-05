import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";

/**
 * Reading the two hand-arranged lists: starter kits (collections) and Popular Use
 * Cases.
 *
 * ## Why both live in one file
 *
 * They are the same table twice. `collections`/`collection_items` and
 * `use_cases`/`use_case_items` have identical columns and identical ordering
 * semantics, and every change to how one of them is read or written is a change
 * to the other — a version of this file with two near-identical implementations
 * would be the place that guarantee quietly stopped being true.
 *
 * So the shapes are shared, the reads are shared, and only the table names and
 * the couple of columns that differ (a use case has a gradient; a collection has
 * an illustration) are threaded through. The writes live next to them in
 * `arrange.ts`.
 */

type AdminClient = Pick<SupabaseClient<Database>, "from">;

/** An ordered item: which playbook, and where in the list it sits. */
export type ArrangedItem = {
  playbookId: string;
  slug: string;
  title: string;
  status: string;
};

export type CollectionSummary = {
  id: string;
  slug: string;
  title: string;
  blurb: string | null;
  illustrationUrl: string | null;
  isFeatured: boolean;
  sort: number;
  itemCount: number;
};

export type UseCaseSummary = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  gradientFrom: string;
  gradientTo: string;
  sort: number;
  itemCount: number;
};

export type CollectionDetail = CollectionSummary & { items: ArrangedItem[] };
export type UseCaseDetail = UseCaseSummary & { items: ArrangedItem[] };

function one<T>(value: T | T[] | null): T | null {
  if (value === null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

/**
 * The playbook behind an item row, in the order it should appear.
 *
 * Sorted by the item's own `sort` rather than the playbook's title, because the
 * order *is* the content — a starter kit that starts with the thing you do first
 * is a different thing from the same kit in alphabetical order, and that is the
 * whole reason this is a join table rather than a tag.
 */
function toItems(
  rows: { playbook_id: string; sort: number; playbooks: { slug: string; title: string; status: string } | { slug: string; title: string; status: string }[] | null }[],
): ArrangedItem[] {
  return rows
    .sort((a, b) => a.sort - b.sort)
    .map((row) => {
      const playbook = one(row.playbooks);
      return {
        playbookId: row.playbook_id,
        slug: playbook?.slug ?? "(removed)",
        title: playbook?.title ?? "Removed playbook",
        status: playbook?.status ?? "",
      };
    });
}

const ITEM_SELECT = "playbook_id, sort, playbooks!inner(slug, title, status)";

export async function listCollections(client: AdminClient): Promise<CollectionSummary[]> {
  const { data, error } = await client
    .from("collections")
    .select("id, slug, title, blurb, illustration_url, is_featured, sort, collection_items(sort)")
    .order("sort");

  if (error) {
    throw new Error(`listCollections: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    blurb: row.blurb,
    illustrationUrl: row.illustration_url,
    isFeatured: row.is_featured,
    sort: row.sort,
    itemCount: (row.collection_items ?? []).length,
  }));
}

export async function getCollection(client: AdminClient, id: string): Promise<CollectionDetail | null> {
  const { data, error } = await client
    .from("collections")
    .select(`id, slug, title, blurb, illustration_url, is_featured, sort, items:collection_items(${ITEM_SELECT})`)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`getCollection(${id}): ${error.message}`);
  }

  if (!data) {
    return null;
  }

  return {
    id: data.id,
    slug: data.slug,
    title: data.title,
    blurb: data.blurb,
    illustrationUrl: data.illustration_url,
    isFeatured: data.is_featured,
    sort: data.sort,
    itemCount: (data.items ?? []).length,
    items: toItems((data.items ?? []) as unknown as Parameters<typeof toItems>[0]),
  };
}

export async function listUseCases(client: AdminClient): Promise<UseCaseSummary[]> {
  const { data, error } = await client
    .from("use_cases")
    .select("id, slug, title, description, gradient_from, gradient_to, sort, use_case_items(sort)")
    .order("sort");

  if (error) {
    throw new Error(`listUseCases: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    gradientFrom: row.gradient_from,
    gradientTo: row.gradient_to,
    sort: row.sort,
    itemCount: (row.use_case_items ?? []).length,
  }));
}

export async function getUseCase(client: AdminClient, id: string): Promise<UseCaseDetail | null> {
  const { data, error } = await client
    .from("use_cases")
    .select(`id, slug, title, description, gradient_from, gradient_to, sort, items:use_case_items(${ITEM_SELECT})`)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`getUseCase(${id}): ${error.message}`);
  }

  if (!data) {
    return null;
  }

  return {
    id: data.id,
    slug: data.slug,
    title: data.title,
    description: data.description,
    gradientFrom: data.gradient_from,
    gradientTo: data.gradient_to,
    sort: data.sort,
    itemCount: (data.items ?? []).length,
    items: toItems((data.items ?? []) as unknown as Parameters<typeof toItems>[0]),
  };
}