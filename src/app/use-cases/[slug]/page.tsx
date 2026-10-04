import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ResultsView } from "@/components/search/results-view";
import { parseResultsParams, toListFilters, type RawSearchParams } from "@/lib/search/params";
import { getUseCase } from "@/server/queries/taxonomy";
import { searchPlaybooks } from "@/server/search";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<RawSearchParams>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const useCase = await getUseCase(slug);

  if (!useCase) {
    return { title: "Not found" };
  }

  return { title: useCase.title, description: useCase.description };
}

/**
 * A use case, opened from the homepage carousel.
 *
 * The results are the use case's own curated membership, which is cross-category
 * by design — that is what distinguishes a use case from a category, so it
 * cannot be expressed as a category filter and is passed as membership instead.
 *
 * Everything else — the filters, the sorts, the views — is the same component
 * the search page uses, because AGENTS.md asks for the usual filters and sort
 * here too.
 */
export default async function UseCasePage({ params: routeParams, searchParams }: Props) {
  const { slug } = await routeParams;
  const useCase = await getUseCase(slug);

  if (!useCase) {
    notFound();
  }

  const parsed = parseResultsParams(await searchParams);
  const result = await searchPlaybooks({
    query: parsed.q,
    filters: { ...toListFilters(parsed), useCaseSlug: slug },
    sort: parsed.sort,
    page: parsed.page,
  });

  return (
    <ResultsView
      basePath={`/use-cases/${slug}`}
      params={parsed}
      result={result}
      title={useCase.title}
      header={
        // The gradient the homepage tile uses, reused so the two are visibly
        // the same thing rather than two similar-looking headers.
        <header
          className="rounded-2xl p-6 text-white"
          style={{
            backgroundImage: `linear-gradient(135deg, ${useCase.gradient_from}, ${useCase.gradient_to})`,
          }}
        >
          <h1 className="text-2xl font-semibold tracking-tight">{useCase.title}</h1>
          <p className="mt-1 max-w-2xl opacity-90">{useCase.description}</p>
        </header>
      }
      // A use case with no playbooks has not failed at anything — the catalogue
      // simply has not written them yet. Saying so is different from a search
      // that found nothing, and the copy says which of the two happened.
      emptyBody="We're testing playbooks for this. Tell us what you need and we will write one."
    />
  );
}