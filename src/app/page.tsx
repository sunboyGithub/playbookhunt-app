import { CategoryExplorer } from "@/components/home/category-explorer";
import {
  CategoryChips,
  HeroCounter,
  ProvenRow,
  QuickLinks,
  ReportCta,
  StarterKits,
  TopPlaybooks,
} from "@/components/home/sections";
import { SearchField } from "@/components/home/search-field";
import { TrendingByCategory } from "@/components/home/trending-by-category";
import { UseCaseCarousel } from "@/components/home/use-case-carousel";
import { getHomepageData } from "@/server/queries/home";

/**
 * The homepage.
 *
 * One `await` for the whole page. The prompt is explicit that sections sharing
 * a data request must appear together and must not each carry their own
 * skeleton, because a page that assembles itself in pieces flashes empty
 * containers at the reader. So there is no `loading.tsx` here and no per-section
 * fallback — either the data arrives and the page renders whole, or the request
 * fails and the route errors, which is visible and fixable rather than a silent
 * half-empty page.
 *
 * `now` comes from the query rather than `Date.now()` here: reading the clock
 * during render is an impure read the React Compiler rejects, and resolving one
 * instant server-side keeps every relative date on the page consistent.
 */
export default async function HomePage() {
  const data = await getHomepageData();
  const now = data.now;

  return (
    <main className="flex-1">
      <div className="space-y-16 pb-20">
        <section className="mx-auto w-full max-w-6xl px-4 pt-12 text-center">
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            What do you want <span className="text-muse">Muse</span> to do?
          </h1>
          <p className="mt-3 text-lg text-muted-foreground">Proven playbooks with real results</p>

          <SearchField className="mx-auto mt-8 max-w-2xl" />

          <div className="mt-6 flex flex-col items-center gap-3">
            <HeroCounter playbooks={data.totals.playbooks} reports={data.totals.reports} />
            <QuickLinks />
          </div>
        </section>

        <CategoryChips categories={data.categories} />

        <UseCaseCarousel useCases={data.useCases} />

        <ProvenRow
          playbooks={data.proven}
          isFallback={data.provenIsFallback}
          agentCounts={data.agentCounts}
          now={now}
        />

        <TopPlaybooks playbooks={data.topThisWeek} now={now} />

        <TrendingByCategory
          playbooks={data.playbooks}
          categories={data.categories}
          agentCounts={data.agentCounts}
          now={now}
        />

        <StarterKits kits={data.kits} />

        <CategoryExplorer playbooks={data.playbooks} categories={data.categories} />

        <ReportCta outcomes={data.recentOutcomes} />
      </div>
    </main>
  );
}