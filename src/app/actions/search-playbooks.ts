"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * Title search for the ⌘K palette.
 *
 * A server action rather than a client-side fetch because the query has to run
 * against pg_trgm in Postgres — matching in the browser would mean shipping the
 * whole catalogue to every reader to filter it there.
 *
 * Returns a plain array rather than throwing. A search box that throws shows an
 * error where the reader expected results; an empty list reads as "no matches",
 * which is the truth for a failed lookup as often as it is a lie.
 */

export type PlaybookSearchHit = {
  slug: string;
  title: string;
  category_slug: string;
  category_name: string;
};

export async function searchPlaybooks(query: string): Promise<PlaybookSearchHit[]> {
  const trimmed = query.trim();

  // Below two characters the trigram operator has nothing to compare against —
  // similarity against a one-character string is noise — so the palette shows
  // its categories and quick actions instead of a list of everything.
  if (trimmed.length < 2) {
    return [];
  }

  const supabase = await createClient();

  const { data, error } = await supabase.rpc("search_playbooks", { q: trimmed });

  if (error) {
    return [];
  }

  return (data ?? []) as PlaybookSearchHit[];
}