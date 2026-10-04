import type { Metadata } from "next";

import { ResultsView } from "@/components/search/results-view";
import { parseResultsParams, toListFilters, type RawSearchParams } from "@/lib/search/params";
import { searchPlaybooks } from "@/server/search";

export const metadata: Metadata = {
  title: "Search playbooks",
  description:
    "Search AI playbooks by the task you want done. Filter by category, outcome and evidence.",
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const params = parseResultsParams(await searchParams);
  const result = await searchPlaybooks({
    query: params.q,
    filters: toListFilters(params),
    sort: params.sort,
    page: params.page,
  });

  return (
    <ResultsView
      basePath="/search"
      params={params}
      result={result}
      title={params.q ? `Results for “${params.q}”` : "Search playbooks"}
      description="Find a playbook by the task you want done, then see whether it actually worked."
    />
  );
}