import { Suspense, type ReactNode } from "react";

import { EmptyState } from "@/components/search/empty-state";
import { FilterPanel } from "@/components/search/filter-panel";
import { MobileFilters } from "@/components/search/mobile-filters";
import {
  MatchedCategoryNotice,
  Pagination,
  ResultCount,
  ResultsList,
} from "@/components/search/results-list";
import {
  OutcomePills,
  SearchQueryInput,
  SortSelect,
  ViewToggle,
} from "@/components/search/search-controls";
import type { ResultsParams } from "@/lib/search/params";
import { listAgents, listCategories } from "@/server/queries/taxonomy";
import { listPopularPlaybooks, type SearchResult } from "@/server/search";

/**
 * The results page, shared by every route that shows a filtered list.
 *
 * /search, /playbooks, /c/[slug] and /use-cases/[slug] all render this. That is
 * the point: the category page is the search page with the category facet
 * already set, the use-case page is the search page with membership already
 * resolved, and /playbooks is the search page with no query. One component means
 * a filter added here appears on all four, and no route can ship an empty state,
 * a sort or a mobile sheet the others lack.
 *
 * `basePath` is the only thing that differs between them, because the filter
 * controls build hrefs against it — a category page's filters must keep
 * filtering the category rather than escaping back to /search.
 *
 * `header` and `emptyCopy` are the two places a route may substitute its own
 * presentation. Everything else is shared on purpose.
 */
export async function ResultsView({
  basePath,
  params,
  result,
  title,
  description,
  header,
  lockCategories = false,
  emptyBody,
}: {
  basePath: string;
  params: ResultsParams;
  result: SearchResult;
  title: string;
  description?: string;
  /** Replaces the plain title block, for routes with a branded header. */
  header?: ReactNode;
  /** A category page hides the category facet; it is already decided. */
  lockCategories?: boolean;
  /**
   * Replaces the no-query empty message. A use case with no playbooks has not
   * failed at anything — the catalogue simply has not written them yet — so its
   * empty state must not read like a filter that found nothing.
   */
  emptyBody?: string;
}) {
  const [categories, agents] = await Promise.all([listCategories(), listAgents()]);
  const panelProps = { categories, agents, showCategories: !lockCategories };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      {header ?? (
        <>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {description ? (
            <p className="mt-1 text-muted-foreground">{description}</p>
          ) : null}
        </>
      )}

      {/* Everything below the header is URL-driven and re-renders from the
          server on each change, so it runs in a transition rather than
          unmounting the page. The Suspense boundaries are what let the client
          controls call useSearchParams on a route the framework might
          otherwise try to render statically. */}
      <Suspense fallback={<div className="mt-6 h-11" />}>
        <div className="mt-6">
          <SearchQueryInput />
        </div>
      </Suspense>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Suspense fallback={null}>
          <OutcomePills />
        </Suspense>
      </div>

      <div className="mt-6 flex flex-col gap-8 lg:flex-row">
        <aside className="hidden w-60 shrink-0 lg:block">
          <Suspense fallback={null}>
            <FilterPanel {...panelProps} />
          </Suspense>
        </aside>

        <div className="min-w-0 flex-1">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <ResultCount total={result.total} query={params.q} />

            <div className="flex items-center gap-2">
              <Suspense fallback={null}>
                <MobileFilters {...panelProps} />
              </Suspense>
              <Suspense fallback={null}>
                <SortSelect />
              </Suspense>
              <Suspense fallback={null}>
                <ViewToggle />
              </Suspense>
            </div>
          </div>

          <MatchedCategoryNotice matched={result.matchedCategory} className="mb-4" />

          {result.isEmpty ? (
            params.q ? (
              <EmptyState
                query={params.q}
                categories={categories}
                popular={await listPopularPlaybooks(3)}
                now={result.now}
              />
            ) : (
              <p className="py-12 text-muted-foreground">
                {emptyBody ?? "Nothing here yet. Try removing a filter."}
              </p>
            )
          ) : (
            <>
              <ResultsList
                playbooks={result.playbooks}
                view={params.view}
                now={result.now}
                params={params}
              />
              <Pagination
                page={result.page}
                pageCount={result.pageCount}
                basePath={basePath}
                params={params}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}