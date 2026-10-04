import "server-only";

import { matchCategories } from "@/lib/search/category-keywords";
import { buildSearchTerms } from "@/lib/search/query";
import { createClient } from "@/lib/supabase/server";
import { nowMs } from "@/server/clock";
import { listPlaybooks } from "@/server/queries/playbooks";
import { listCategories } from "@/server/queries/taxonomy";
import {
  DEFAULT_SORT,
  isSortOption,
  type ListPlaybooksFilters,
  type PlaybookWithRelations,
  type SortOption,
} from "@/server/queries/types";

/** Rows per page. The brief's number. */
export const PAGE_SIZE = 24;

/**
 * Below this, a text result is treated as a near-miss and the category fallback
 * runs to widen it.
 *
 * Three, not zero. A reader who searches "japan" and gets one result has found
 * what they asked for; adding four unrelated travel playbooks below it would
 * bury the answer. A reader who gets *nothing* has been failed by the search,
 * and that is the case the fallback exists for.
 */
const MIN_TEXT_RESULTS = 3;

/**
 * Large enough to hold the whole catalogue. Same reasoning as
 * `CATALOGUE_PAGE` in queries/playbooks.ts: this is a correctness floor, not a
 * display limit, because ranking and the category fallback both need to see
 * every published row to decide what the reader sees first.
 */
const SEARCH_POOL = 500;

/** How many rows the category fallback may contribute. */
const FALLBACK_ROWS = 12;

export type SearchParams = {
  /** The raw query string, unparsed. An empty string means "browse", not search. */
  query?: string;
  /** Filters other than paging, which this module owns. */
  filters?: Omit<ListPlaybooksFilters, "limit" | "offset">;
  sort?: SortOption;
  /** 1-based. Values below 1 are treated as 1 rather than rejected. */
  page?: number;
};

export type MatchedCategory = {
  slug: string;
  name: string;
  /** The reader's own words that triggered this, for the "Matched:" line. */
  keywords: string[];
};

export type SearchResult = {
  playbooks: PlaybookWithRelations[];
  /** Total matching rows, so the page count is honest rather than per-page. */
  total: number;
  page: number;
  pageCount: number;
  /**
   * Set when the category map rescued a thin result set. Null otherwise —
   * including when it ran and contributed nothing, because a "Matched: X"
   * line above results the reader did not get is a lie about why they are
   * looking at these rows.
   */
  matchedCategory: MatchedCategory | null;
  /** Nothing matched. The page shows popular playbooks and the request form. */
  isEmpty: boolean;
  /**
   * The instant this render is anchored to, in milliseconds.
   *
   * Read here rather than in a component on purpose: reading the clock during
   * render is impure, and one timestamp per page is what makes every "3d ago"
   * on it describe the same moment.
   */
  now: number;
};

/**
 * The results page's data source: every route that shows a list of playbooks
 * goes through here, so /search, /playbooks, /c/[slug] and /use-cases/[slug]
 * cannot drift apart in how they filter, rank or paginate.
 */
export async function searchPlaybooks({
  query = "",
  filters = {},
  sort = DEFAULT_SORT,
  page = 1,
}: SearchParams): Promise<SearchResult> {
  const currentPage = Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1;
  const terms = buildSearchTerms(query);

  // The whole filtered catalogue, then slice here rather than paging in the
  // query. A cursor would be the scalable answer and is not needed at 48 rows;
  // more importantly, `best_evidence` needs the full set to fall back from rank
  // to evidence order, which a page cannot do without a second query.
  const pool = await listPlaybooks({ ...filters, limit: SEARCH_POOL }, sort);

  let candidates = pool;
  let rankById: Map<string, number> | null = null;
  let matchedCategory: MatchedCategory | null = null;

  if (!terms.isEmpty) {
    const ranks = await fetchTextRank(terms.text, terms.synonyms);
    rankById = ranks;

    // Only ids the text search actually matched. A playbook nobody typed words
    // for cannot be a result for those words, however well it scores.
    candidates = pool.filter((row) => ranks.has(row.id));

    if (candidates.length < MIN_TEXT_RESULTS && !filters.categorySlug) {
      const widening = await findWideningCategory(candidates, pool, query);
      if (widening) {
        matchedCategory = widening;
        candidates = widenWithCategory(candidates, pool, widening);
      }
    }
  }

  if (rankById && sort === "best_evidence") {
    // The brief's order for the default sort: evidence first, text rank as the
    // tie-break. Ranking by text first would let a four-report row outrank a
    // proven one purely for matching more words, which inverts the point of the
    // site.
    candidates = [...candidates].sort(
      (a, b) =>
        compareNullable(b.stats?.evidence_score, a.stats?.evidence_score) ||
        compareNullable(rankById.get(b.id), rankById.get(a.id)),
    );
  }

  const total = candidates.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const start = (currentPage - 1) * PAGE_SIZE;

  return {
    playbooks: candidates.slice(start, start + PAGE_SIZE),
    total,
    page: currentPage,
    pageCount,
    matchedCategory,
    isEmpty: total === 0,
    now: nowMs(),
  };
}

/**
 * The category the query looks like it is asking about, if widening to it would
 * actually add anything.
 *
 * Returns null when there is no usable category match, or when the best match's
 * rows are already all on screen. Both cases must report "no widening": a
 * "Matched: Personal finance" line above results the reader was shown anyway
 * misdescribes where they came from, and costs a category query to discover.
 */
async function findWideningCategory(
  candidates: PlaybookWithRelations[],
  pool: PlaybookWithRelations[],
  query: string,
): Promise<MatchedCategory | null> {
  const matches = matchCategories(query);
  if (matches.length === 0) {
    return null;
  }

  const present = new Set(candidates.map((row) => row.id));
  const categories = await listCategories();
  const bySlug = new Map(categories.map((category) => [category.slug, category]));

  for (const match of matches) {
    const category = bySlug.get(match.slug);
    if (!category) {
      continue;
    }

    const additions = pool.filter(
      (row) => row.category?.slug === match.slug && !present.has(row.id),
    );

    if (additions.length > 0) {
      return { slug: match.slug, name: category.name, keywords: match.matched };
    }
  }

  return null;
}

/**
 * The rows to append for a widening.
 *
 * Taken from `pool`, which is already in the caller's sort order — so a reader
 * who typed a vague phrase gets the best-evidenced playbooks in the category
 * they meant, and the "Matched:" line explains the substitution instead of
 * hiding it.
 */
function widenWithCategory(
  candidates: PlaybookWithRelations[],
  pool: PlaybookWithRelations[],
  matched: MatchedCategory,
): PlaybookWithRelations[] {
  const present = new Set(candidates.map((row) => row.id));
  const additions = pool
    .filter((row) => row.category?.slug === matched.slug && !present.has(row.id))
    .slice(0, FALLBACK_ROWS);

  return additions.length === 0 ? candidates : [...candidates, ...additions];
}

/**
 * Text relevance for the current query, as id → rank.
 *
 * Throws rather than degrading to an empty map. A silently-empty result here
 * would flow into the category fallback and then into "no playbooks yet" — the
 * reader would be told the catalogue does not have their answer, when in fact
 * the database was unreachable. An error is the honest answer.
 */
async function fetchTextRank(text: string, synonyms: string): Promise<Map<string, number>> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("search_playbooks_ranked", {
    q: text,
    syn: synonyms,
    match_limit: SEARCH_POOL,
  });

  if (error) {
    throw new Error(`search_playbooks_ranked: ${error.message}`);
  }

  const ranks = new Map<string, number>();
  for (const row of data ?? []) {
    // `real` comes back as a number, but a null would mean a row matched and
    // scored nothing — kept out of the map rather than stored as 0, so a
    // rankless match still counts as a match.
    if (row.rank !== null && row.rank !== undefined) {
      ranks.set(row.id, Number(row.rank));
    } else {
      ranks.set(row.id, 0);
    }
  }

  return ranks;
}

/** Descending, nulls last. Same rule as the sort in queries/playbooks.ts. */
function compareNullable(
  a: number | null | undefined,
  b: number | null | undefined,
): number {
  const left = a ?? null;
  const right = b ?? null;
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return right - left;
}

/**
 * Popular playbooks, for the empty state.
 *
 * `most_tried` rather than `best_evidence`: with no reports every row has the
 * same evidence score, so "best evidence" would order by id and pick the same
 * three playbooks for every empty search. Tries are the one signal that
 * distinguishes an untested catalogue.
 */
export async function listPopularPlaybooks(limit = 3): Promise<PlaybookWithRelations[]> {
  return listPlaybooks({ limit }, "most_tried");
}

/** Read a sort out of a URL, falling back to the default for anything unknown. */
export function sortFromParam(value: string | undefined): SortOption {
  return isSortOption(value) ? value : DEFAULT_SORT;
}