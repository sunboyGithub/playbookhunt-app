import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ResultsView } from "@/components/search/results-view";
import { parseResultsParams, toListFilters, type RawSearchParams } from "@/lib/search/params";
import { getCategory } from "@/server/queries/taxonomy";
import { searchPlaybooks } from "@/server/search";

/**
 * A category page: the results view with the category facet already set.
 *
 * The facet is taken from the path and put into the params, rather than being
 * passed to the results view separately. That way `?category=` in the URL and
 * `/c/[slug]` arrive at the same place by the same code, and the sidebar cannot
 * offer a second, competing category that the header contradicts.
 */
type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<RawSearchParams>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const category = await getCategory(slug);

  if (!category) {
    return { title: "Category not found" };
  }

  return {
    title: `${category.name} playbooks`,
    description: category.description,
  };
}

export default async function CategoryPage({ params: routeParams, searchParams }: Props) {
  const { slug } = await routeParams;
  const category = await getCategory(slug);

  if (!category) {
    notFound();
  }

  // The path wins over any `?category=` on the query string, so a shared link
  // that has drifted still lands on the category the path names.
  const parsed = parseResultsParams({ ...(await searchParams), category: slug });
  const result = await searchPlaybooks({
    query: parsed.q,
    filters: toListFilters(parsed),
    sort: parsed.sort,
    page: parsed.page,
  });

  return (
    <ResultsView
      basePath={`/c/${slug}`}
      params={parsed}
      result={result}
      title={`${category.emoji} ${category.name}`}
      description={category.description ?? undefined}
      lockCategories
    />
  );
}