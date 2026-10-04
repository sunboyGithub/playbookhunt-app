import type { Metadata } from "next";

import { ResultsView } from "@/components/search/results-view";
import { parseResultsParams, toListFilters, type RawSearchParams } from "@/lib/search/params";
import { searchPlaybooks } from "@/server/search";

export const metadata: Metadata = {
  title: "All playbooks",
  description:
    "Every playbook, ordered by evidence. Filter by category, outcome, reports and time to complete.",
};

/**
 * The nav's "Playbooks" destination: the results page with no query.
 *
 * The same component as /search rather than a separate listing, so the filters,
 * the sorts and the empty state are identical — the only difference is the
 * absence of a query. Sorted Best evidence, per the brief.
 */
export default async function PlaybooksPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const params = parseResultsParams(await searchParams);
  const result = await searchPlaybooks({
    filters: toListFilters(params),
    sort: params.sort,
    page: params.page,
  });

  return (
    <ResultsView
      basePath="/playbooks"
      params={params}
      result={result}
      title="All playbooks"
      description="Every playbook we have, ordered by how much evidence is behind it."
    />
  );
}