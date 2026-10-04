"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useTransition } from "react";

import { trackFilterChanged, trackSearch } from "@/lib/analytics";
import {
  buildResultsHref,
  parseResultsParams,
  toQueryString,
  type ResultsParams,
} from "@/lib/search/params";

/**
 * The URL, as the filter controls see it.
 *
 * Every control reads the current filters from here and writes them back by
 * pushing a new URL. There is no local filter state anywhere in this feature:
 * a filter held only in React would be invisible in the address bar, lost on
 * refresh, and unshareable — which the brief rules out explicitly ("URL is the
 * source of truth for all filters/sort (shareable)").
 *
 * `router.push` rather than a history replace, because a filter change is a
 * navigation a reader may want to go back from. Paging and view changes replace
 * instead, since Back should return to the previous *result set* rather than
 * step through twenty view toggles.
 */
export function useResultsParams() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const params = useMemo(
    () => parseResultsParams(Object.fromEntries(searchParams.entries())),
    [searchParams],
  );

  /**
   * Apply a change and navigate.
   *
   * Wrapped in a transition so the pending state can drive a subtle opacity
   * change. Without it, a filter click would render the new controls
   * immediately and the old results a moment later, with nothing indicating
   * that anything was happening.
   */
  const navigate = useCallback(
    (changes: { [K in keyof ResultsParams]?: ResultsParams[K] | null }, options?: { replace?: boolean }) => {
      const href = buildResultsHref(pathname, params, changes);
      startTransition(() => {
        if (options?.replace) {
          router.replace(href, { scroll: false });
        } else {
          router.push(href, { scroll: false });
        }
      });
    },
    [pathname, params, router],
  );

  /** The same, plus the analytics event. Every facet change goes through here. */
  const changeFacet = useCallback(
    (facet: string, value: string, changes: Parameters<typeof navigate>[0]) => {
      trackFilterChanged(facet, value);
      navigate(changes);
    },
    [navigate],
  );

  /**
   * Submit the search box.
   *
   * Logged here rather than on every keystroke: a search event is a decision,
   * and someone typing "lower my" has not decided anything yet.
   */
  const submitQuery = useCallback(
    (q: string) => {
      trackSearch(q.trim().length, activeFacetNames(params));
      navigate({ q: q.trim() || null });
    },
    [navigate, params],
  );

  return { params, navigate, changeFacet, submitQuery, isPending, pathname };
}

/** Facet names only — never values, which for some facets would be a query. */
export function activeFacetNames(params: ResultsParams): string[] {
  const names: string[] = [];
  if (params.category) names.push("category");
  if (params.agent) names.push("agent");
  if (params.outcome) names.push("outcome");
  if (params.verified) names.push("verified");
  if (params.minReports) names.push("min_reports");
  if (params.timeBand) names.push("time");
  return names;
}

/** The query string as it would appear in the address bar, for copy-link use. */
export function useShareableQuery(): string {
  const searchParams = useSearchParams();
  return useMemo(() => toQueryString(parseResultsParams(Object.fromEntries(searchParams.entries()))), [searchParams]);
}