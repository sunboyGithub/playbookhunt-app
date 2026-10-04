import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";

import { AgentMark } from "@/components/agents/agent-mark";
import { Audience, OutcomePreview, ReportCta, Steps } from "@/components/playbook/detail/audience";
import { InputsList } from "@/components/playbook/detail/inputs-list";
import { PromptBlock } from "@/components/playbook/detail/prompt-block";
import { ReportFilters } from "@/components/playbook/detail/report-filters";
import { ReportList } from "@/components/playbook/detail/report-list";
import { SaveButton } from "@/components/playbook/detail/save-button";
import { ShareMenu } from "@/components/playbook/detail/share-menu";
import { StatTiles } from "@/components/playbook/detail/stat-tiles";
import { WorkedBar } from "@/components/playbook/detail/worked-bar";
import { DetailSidebar } from "@/components/playbook/detail/sidebar";
import { PlaybookCard } from "@/components/playbook-card";
import { TryDialog } from "@/components/try/try-dialog";
import { toTryFields } from "@/lib/try/fields";
import { getEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import type { DetailStats } from "@/lib/stats/detail";
import { toOutcomeType } from "@/lib/stats/detail";
import { formatEvidenceHeadline, formatVerified } from "@/lib/stats/format";
import { nowMs } from "@/server/clock";
import { getPublishedPlaybookBySlug, listRelatedPlaybooks } from "@/server/queries/playbooks";
import { countReportsSince, listReportProviders, listReports } from "@/server/queries/reports";
import { listAgents } from "@/server/queries/taxonomy";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * Statistics are regenerated every five minutes.
 *
 * **This is currently inert, and the build output says so.** Every route in this
 * app reports as `ƒ (Dynamic)` — including `/privacy` and `/terms`, which have no
 * data at all — and the cause is the root layout: `src/app/layout.tsx` calls
 * `listCategories()` for the header nav, that query uses the server Supabase
 * client, and `lib/supabase/server.ts` reads `cookies()`. A `cookies()` read in
 * the root layout opts the whole app into dynamic rendering, so the `revalidate`
 * window below never applies.
 *
 * It is kept because it becomes correct the moment the layout stops reading
 * cookies — and it documents the intent — but nothing should be claimed about
 * ISR until the build output changes. The fix is to give the layout's nav query a
 * public client that does not touch the session, which is its own change and is
 * tracked rather than smuggled in here.
 *
 * On-demand revalidation lands in P9 alongside the aggregation job, so a stats
 * refresh does not have to wait out the window.
 */
export const revalidate = 300;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const playbook = await getPublishedPlaybookBySlug(slug);

  if (!playbook) {
    return { title: "Playbook not found" };
  }

  const canonical = `${getEnv().NEXT_PUBLIC_SITE_URL}/p/${playbook.slug}`;

  return {
    title: playbook.title,
    // The promise, verbatim. It is already written as the sentence a reader
    // would want in a search result; a second, separately-written description
    // would be a second claim about the same playbook.
    description: playbook.promise,
    alternates: { canonical },
    openGraph: {
      title: playbook.title,
      description: playbook.promise,
      url: canonical,
      type: "article",
    },
  };
}

/**
 * Breadcrumb: Home / <Category> / <Title>.
 *
 * The title is the current page, so it is text rather than a link — a link to
 * the page you are already on looks live and goes nowhere.
 */
function Breadcrumb({
  categorySlug,
  categoryName,
  title,
}: {
  categorySlug: string;
  categoryName: string;
  title: string;
}) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
        <li>
          <Link href="/" className="hover:text-foreground">
            Home
          </Link>
        </li>
        <li aria-hidden>
          <ChevronRight className="size-3.5" />
        </li>
        <li>
          <Link href={`/c/${categorySlug}`} className="hover:text-foreground">
            {categoryName}
          </Link>
        </li>
        <li aria-hidden>
          <ChevronRight className="size-3.5" />
        </li>
        <li aria-current="page" className="text-foreground">
          {title}
        </li>
      </ol>
    </nav>
  );
}

/**
 * HowTo structured data.
 *
 * The steps only. There is deliberately no `aggregateRating`, and that is not an
 * oversight to be revisited later: a success percentage is not a star rating.
 * Emitting one would put a number in a search result that this site never
 * computed and that a reader would reasonably read as a review score — which is
 * the exact substitution AGENTS.md rules out.
 *
 * `totalTime` is the playbook's own `time_max`, not a computed estimate.
 */
function HowToJsonLd({
  title,
  description,
  steps,
  totalTimeMinutes,
}: {
  title: string;
  description: string;
  steps: { body: string }[];
  totalTimeMinutes: number | null;
}) {
  const json = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: title,
    description,
    ...(totalTimeMinutes ? { totalTime: `PT${totalTimeMinutes}M` } : {}),
    step: steps.map((step, index) => ({
      "@type": "HowToStep",
      position: index + 1,
      text: step.body,
    })),
  };

  return (
    <script
      type="application/ld+json"
      // Every field here is already rendered on this page and none of it is
      // user-submitted free text — but the escaping is still required, because
      // a `</script>` inside any string ends the block early and turns the rest
      // of the document into markup.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(json).replace(/</g, "\\u003c") }}
    />
  );
}

/**
 * The verified badge and try button, for widths with no sidebar column.
 *
 * Only those two. The "Works with" block, the sources and "Good to know" are
 * *not* repeated above the fold on a phone: the full sidebar renders once,
 * further down, and a reader scrolling a single column meets each piece once.
 * Duplicating the whole sidebar to satisfy "sidebar content moves under the
 * header" would mean two copies of every heading id on the page, which breaks
 * `aria-labelledby` for both.
 */
function MobileTryBar({
  verifiedLabel,
  children,
}: {
  verifiedLabel: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-5 flex flex-wrap items-center gap-3 lg:hidden">
      {verifiedLabel ? (
        <span
          className="rounded-full bg-verified-bg px-3 py-1 text-sm font-medium"
          data-testid="verified-badge-mobile"
        >
          Verified {verifiedLabel}
        </span>
      ) : null}
      {children}
    </div>
  );
}

export default async function PlaybookPage({ params, searchParams }: Props) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const playbook = await getPublishedPlaybookBySlug(slug);

  if (!playbook) {
    notFound();
  }

  const now = nowMs();
  const content = playbook.current_version;

  const agentSlug = typeof query.agent === "string" ? query.agent : undefined;
  const provider = typeof query.provider === "string" ? query.provider : undefined;
  const resultParam = typeof query.result === "string" ? query.result : undefined;
  // An unknown value in the URL means "no filter", not an empty list. A
  // hand-edited `?result=nope` should widen the view rather than look like the
  // playbook has no reports.
  const result =
    resultParam === "worked" || resultParam === "partly" || resultParam === "didnt"
      ? resultParam
      : undefined;

  const [agents, reports, providers, reportsInLast30Days, related] = await Promise.all([
    listAgents(),
    listReports(playbook.id, { agentSlug, result, provider, limit: 5 }),
    listReportProviders(playbook.id),
    countReportsSince(playbook.id, 30, now),
    listRelatedPlaybooks(playbook, 3),
  ]);

  // The agent names in the filter come from the reports' own agents, not from
  // the global list: offering an agent nobody has reported with would produce an
  // empty list that reads as "it didn't work there" rather than "nobody has
  // tried it there".
  const reportedAgents = new Map<string, string>();
  for (const row of reports.rows) {
    if (row.agent_slug && row.agent_name) {
      reportedAgents.set(row.agent_slug, row.agent_name);
    }
  }

  const stats: DetailStats = {
    tried_count: playbook.stats?.tried_count ?? 0,
    report_count: playbook.stats?.report_count ?? 0,
    worked: playbook.stats?.worked ?? 0,
    partly: playbook.stats?.partly ?? 0,
    didnt: playbook.stats?.didnt ?? 0,
    success_rate_raw: playbook.stats?.success_rate_raw ?? null,
    amount_n: playbook.stats?.amount_n ?? 0,
    median_amount: playbook.stats?.median_amount ?? null,
    last30_success: playbook.stats?.last30_success ?? null,
    outcome_type: toOutcomeType(playbook.outcome_type),
    outcome_unit: playbook.outcome_unit,
  };

  const triedCount = Number(stats.tried_count ?? 0);
  const timeRange =
    playbook.time_min === playbook.time_max
      ? `${playbook.time_min} min`
      : `${playbook.time_min}–${playbook.time_max} min`;

  const canonical = `${getEnv().NEXT_PUBLIC_SITE_URL}/p/${playbook.slug}`;
  const tryHref = `/p/${playbook.slug}/try`;
  const verified = formatVerified(playbook.last_verified_at, now);

  // Whether to offer a reminder. Read here rather than in the sheet so the
  // signed-out card is a decision the server makes and the client only renders.
  const supabase = await createClient();
  const { data: sessionData } = await supabase.auth.getUser();
  const signedIn = Boolean(sessionData.user);

  const tryPanel = {
    playbookId: playbook.id,
    playbookSlug: playbook.slug,
    versionId: content?.id ?? null,
    promise: playbook.promise,
    inputs: toTryFields(content?.inputs ?? []),
    promptTemplate: content?.prompt_template ?? "",
    steps: content?.steps ?? [],
    selectableAgents: agents.selectable,
    comingSoonAgents: agents.coming_soon,
    // The same headline the cards use, so the sheet cannot claim an evidence
    // line the page beneath it is not allowed to show.
    recommendedEvidence: formatEvidenceHeadline(playbook.stats),
    signedIn,
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      {content && content.steps.length > 0 ? (
        <HowToJsonLd
          title={playbook.title}
          description={playbook.promise}
          steps={content.steps}
          totalTimeMinutes={playbook.time_max}
        />
      ) : null}

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px]">
        <main className="min-w-0">
          <Breadcrumb
            categorySlug={playbook.category.slug}
            categoryName={playbook.category.name}
            title={playbook.title}
          />

          <header className="mt-4">
            <div className="flex flex-wrap items-start gap-4">
              <h1 className="text-3xl font-semibold tracking-tight">{playbook.title}</h1>
              <div className="ml-auto flex items-center gap-2">
                <SaveButton signedIn={false} />
                <ShareMenu slug={playbook.slug} url={canonical} title={playbook.promise} />
              </div>
            </div>

            <p className="mt-2 text-lg text-muted-foreground">{playbook.promise}</p>

            <ul className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              <li>
                <Link href={`/c/${playbook.category.slug}`} className="hover:text-foreground">
                  {playbook.category.name}
                </Link>
              </li>
              <li aria-hidden>·</li>
              <li className="flex items-center gap-1.5">
                <AgentMark slug={playbook.primary_agent?.slug ?? "muse"} className="size-4 text-muse" />
                Tested with {playbook.primary_agent?.display_name ?? "Muse"}
              </li>
              <li aria-hidden>·</li>
              <li>{timeRange}</li>
            </ul>

            <MobileTryBar verifiedLabel={verified ? verified.replace(/^verified\s+/, "") : null}>
              <TryDialog panel={tryPanel}>
                <span
                  className="inline-flex h-11 items-center rounded-full bg-brand px-6 text-base font-medium text-white"
                  data-testid="try-button-mobile"
                >
                  Try this playbook
                </span>
              </TryDialog>
            </MobileTryBar>
          </header>

          <div className="mt-6 space-y-8">
            <StatTiles stats={stats} />

            <OutcomePreview url={playbook.preview_image_url} title={playbook.title} />

            <Audience whoFor={playbook.who_for} whoNotFor={playbook.who_not_for} />

            {content ? (
              <>
                <InputsList inputs={content.inputs} />
                <PromptBlock
                  prompt={content.prompt_template}
                  playbookId={playbook.id}
                  versionId={content.id}
                  tryHref={tryHref}
                  stepCount={content.steps.length}
                />
                <Steps steps={content.steps} />
              </>
            ) : null}

            <WorkedBar stats={stats} reportsInLast30Days={reportsInLast30Days} />

            <section aria-labelledby="reports-heading">
              <h2 id="reports-heading" className="text-lg font-semibold">
                Reports from others
              </h2>

              <ReportFilters
                providers={providers}
                agentOptions={[...reportedAgents].map(([slug, name]) => ({ slug, name }))}
              />

              <ReportList
                reports={reports.rows}
                now={now}
                emptyMessage={
                  reports.total === 0
                    ? "No reports yet — be the first"
                    : "No reports match these filters."
                }
              />

              {reports.total > reports.rows.length ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  Showing the {reports.rows.length} most recent of {reports.total} reports.
                </p>
              ) : null}
            </section>

            <ReportCta />
          </div>
        </main>

        {/* The one and only copy of the sidebar. Stacked below the main column on
            a phone, sticky beside it on desktop. */}
        <DetailSidebar
          activeAgent={playbook.primary_agent}
          comingSoon={agents.coming_soon}
          sources={content?.sources ?? []}
          stats={stats}
          authorName={null}
          hasAuthor={Boolean(playbook.author_id)}
          changelog={content?.changelog ?? null}
          lastVerifiedAt={playbook.last_verified_at}
          now={now}
          triedCount={triedCount}
          tryButton={
            <TryDialog panel={tryPanel}>
              <span
                className="inline-flex h-11 w-full items-center justify-center rounded-full bg-brand text-base font-medium text-white"
                data-testid="try-button"
              >
                Try this playbook
              </span>
            </TryDialog>
          }
        />
      </div>

      {related.length > 0 ? (
        <section aria-labelledby="related-heading" className="mt-12">
          <h2 id="related-heading" className="text-lg font-semibold">
            Related playbooks
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((item) => (
              <PlaybookCard key={item.id} playbook={item} density="compact" now={now} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}