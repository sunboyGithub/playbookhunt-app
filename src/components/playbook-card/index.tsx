import Link from "next/link";
import { Play, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  formatEvidenceHeadline,
  formatEvidenceLine,
  formatEvidenceSampleSize,
  formatOutcomeLine,
  formatRelativeDate,
  toOutcomeStats,
  type OutcomeStats,
} from "@/lib/stats/format";
import { cn } from "@/lib/utils";
import type { PlaybookWithRelations } from "@/server/queries/types";

/**
 * The one card, in three densities.
 *
 * Three densities rather than three components because they show the same
 * evidence, and the thresholds that govern it — 20 reports for a percentage, 10
 * amounts for a median — must not be restated per variant. If a compact card
 * could render a figure a rich card would refuse, the brief's rule would be
 * enforced by whichever variant a page happened to use.
 *
 * Every figure here comes from `lib/stats/format`, so "can this number be shown
 * at all" is decided in one place and unit-tested.
 */

export type PlaybookCardProps = {
  playbook: PlaybookWithRelations;
  density: "rich" | "compact" | "row";
  /** 1-based position, shown in the row density only. */
  rank?: number;
  /** How many agents beyond the primary this playbook works with. */
  agentCount?: number;
  /**
   * The instant this render is anchored to, as a millisecond timestamp.
   *
   * Required rather than defaulted: reading the clock during render is impure,
   * and — more usefully — one timestamp per page is what makes every "3d ago"
   * on the page describe the same moment.
   */
  now: number;
  className?: string;
};

/** Per-category preview tint, matching the frames. Not an outcome colour. */
const CATEGORY_TINT: Record<string, string> = {
  "personal-finance": "bg-tint-mint",
  "travel-booking": "bg-tint-lavender",
  "travel-planning": "bg-tint-peach",
  shopping: "bg-tint-lavender",
  "small-business": "bg-tint-mint",
  productivity: "bg-tint-peach",
  health: "bg-tint-mint",
  creativity: "bg-tint-peach",
};

function tintFor(categorySlug: string | undefined): string {
  return CATEGORY_TINT[categorySlug ?? ""] ?? "bg-tint-mint";
}

function PlaybookCardImpl({
  playbook,
  density,
  rank,
  agentCount = 0,
  now,
  className,
}: PlaybookCardProps) {
  const href = `/p/${playbook.slug}`;
  const outcomeStats = toOutcomeStats(playbook);
  const evidence = formatEvidenceLine(outcomeStats);
  const outcome = formatOutcomeLine(outcomeStats, now);
  const category = playbook.category;

  if (density === "row") {
    return (
      <RowCard
        playbook={playbook}
        href={href}
        rank={rank}
        outcomeStats={outcomeStats}
        className={className}
      />
    );
  }

  if (density === "compact") {
    return (
      <Link
        href={href}
        data-testid="playbook-card"
        data-density="compact"
        className={cn(
          "group flex flex-col gap-2 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          className,
        )}
      >
        <h3 className="line-clamp-2 text-sm font-medium leading-snug">{playbook.title}</h3>
        {evidence ? (
          <p className="text-xs text-muted-foreground">{evidence}</p>
        ) : (
          <p className="text-xs text-muted-foreground">No reports yet</p>
        )}
        <div className="mt-auto flex items-center justify-between pt-1">
          <AgentChips playbook={playbook} agentCount={agentCount} />
          <CreatorAvatar playbook={playbook} />
        </div>
      </Link>
    );
  }

  const verified = playbook.last_verified_at
    ? formatRelativeDate(playbook.last_verified_at, now)
    : null;

  return (
    <article
      data-testid="playbook-card"
      data-density="rich"
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-shadow hover:shadow-md focus-within:ring-2 focus-within:ring-ring",
        className,
      )}
    >
      <div className={cn("relative aspect-video w-full overflow-hidden", tintFor(category?.slug))}>
        {playbook.preview_image_url ? (
          // Preview images come from the `previews` bucket at author-supplied
          // dimensions, which the optimiser cannot fetch from; the box already
          // constrains the size, so a plain img is the right tool here.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={playbook.preview_image_url}
            alt=""
            loading="lazy"
            decoding="async"
            className="size-full object-cover"
          />
        ) : (
          // No preview yet. A tinted block is honest about that; a stock image
          // would imply a result nobody captured.
          <div aria-hidden className="size-full" />
        )}

        <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
          <span className="rounded-md bg-foreground/85 px-2 py-1 text-[11px] font-medium text-background">
            {category?.name}
          </span>
          {verified ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-verified-bg px-2 py-1 text-[11px] font-medium text-foreground">
              <span aria-hidden>✓</span> Verified {verified}
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="text-base font-semibold leading-tight">
          <Link href={href} className="after:absolute after:inset-0 focus-visible:outline-none">
            {playbook.title}
          </Link>
        </h3>

        <p className="line-clamp-1 text-sm text-muted-foreground">{playbook.promise}</p>

        <div className="space-y-0.5 text-sm">
          {evidence ? (
            <p className="text-foreground">{evidence}</p>
          ) : (
            <p className="text-muted-foreground">Early · 0 reports</p>
          )}
          {outcome ? <p className="text-muted-foreground">{outcome}</p> : null}
        </div>

        <div className="mt-auto flex items-center justify-between gap-2 pt-3">
          <AgentChips playbook={playbook} agentCount={agentCount} />
          <div className="relative z-10 flex items-center gap-2">
            <CreatorAvatar playbook={playbook} />
            {/* Revealed on hover or focus, but only where hover actually
                exists. `@media(hover:hover)` is false on touch devices, so the
                button simply never gets the hiding rule and is always visible
                there — which is the frame's requirement, and the reason this is
                a media query rather than a `hover:` utility.

                Goes to the standalone try page rather than opening the sheet.
                A sheet needs this playbook's inputs, prompt and steps, and a
                listing page shows a dozen cards — inlining all of that to fill a
                dialog nobody has opened yet would be a large cost paid on every
                listing view. The sheet is for the detail page, where the reader
                has already committed to this one playbook. */}
            <Button
              asChild
              size="sm"
              className="rounded-full bg-brand text-white hover:bg-brand/90 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:focus-visible:opacity-100 group-hover:opacity-100"
            >
              <Link href={`${href}/try`}>
                <Play aria-hidden className="size-3" />
                Try
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </article>
  );
}

function RowCard({
  playbook,
  href,
  rank,
  outcomeStats,
  className,
}: {
  playbook: PlaybookWithRelations;
  href: string;
  rank?: number;
  outcomeStats: OutcomeStats;
  className?: string;
}) {
  const headline = formatEvidenceHeadline(outcomeStats);
  const sampleSize = formatEvidenceSampleSize(outcomeStats);

  return (
    <div
      data-testid="playbook-card"
      data-density="row"
      className={cn("flex items-center gap-4 py-4", className)}
    >
      {rank !== undefined ? (
        <span className="w-5 shrink-0 text-center text-sm font-medium text-muted-foreground tabular-nums">
          {rank}
        </span>
      ) : null}

      <span
        aria-hidden
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-lg text-lg",
          tintFor(playbook.category?.slug),
        )}
      >
        {playbook.category?.emoji}
      </span>

      <div className="min-w-0 flex-1">
        <h3 className="truncate text-sm font-medium">
          <Link href={href} className="hover:underline">
            {playbook.title}
          </Link>
        </h3>
        <p className="truncate text-xs text-muted-foreground">
          {playbook.promise} · {playbook.category?.name}
        </p>
      </div>

      <div className="shrink-0 rounded-lg border border-border px-4 py-2 text-center">
        <p className="text-sm font-semibold text-worked">{headline}</p>
        {sampleSize ? <p className="text-[11px] text-muted-foreground">{sampleSize}</p> : null}
      </div>
    </div>
  );
}

/**
 * The primary agent as a Muse-blue pill, plus a count of the others.
 *
 * A count with no names is deliberate — the frame shows "+3", and listing four
 * agent names in a chip row costs more attention than it returns. The pill is a
 * link to the try flow, which is where the reader picks one.
 */
function AgentChips({
  playbook,
  agentCount,
}: {
  playbook: PlaybookWithRelations;
  agentCount: number;
}) {
  const agent = playbook.primary_agent;

  return (
    <div className="flex items-center gap-1.5">
      {agent ? (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-muse-line bg-background px-2 py-1 text-xs font-medium text-muse">
          <span
            aria-hidden
            className="flex size-4 items-center justify-center rounded-full bg-muse-soft text-[9px]"
          >
            {agent.display_name.slice(0, 1)}
          </span>
          {agent.display_name}
        </span>
      ) : null}
      {agentCount > 0 ? (
        <span className="inline-flex items-center gap-0.5 rounded-full border border-border px-2 py-1 text-xs text-muted-foreground">
          <Plus aria-hidden className="size-3" />
          {agentCount}
        </span>
      ) : null}
    </div>
  );
}

/**
 * The playbook's author.
 *
 * Creator profiles are P13, so this reads `author_id` and shows an initial. It
 * is a placeholder shape, not a finished attribution — recorded here so it is
 * not mistaken for one.
 */
function CreatorAvatar({ playbook }: { playbook: PlaybookWithRelations }) {
  if (!playbook.author_id) {
    return null;
  }

  return (
    <span
      title="Creator profile arrives in P13"
      aria-hidden
      className="relative flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground"
    >
      <span className="absolute right-0 bottom-0 size-2 rounded-full bg-brand" />
    </span>
  );
}

export function PlaybookCard(props: PlaybookCardProps) {
  return <PlaybookCardImpl {...props} />;
}

export { CATEGORY_TINT, tintFor };