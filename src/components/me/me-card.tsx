"use client";

import Link from "next/link";
import { Loader2, Star } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatEvidenceHeadline, formatRelativeDate } from "@/lib/stats/format";
import type { MePlaybook } from "@/server/queries/me";

/**
 * One row in "My playbooks".
 *
 * Built to Frame 9, and every difference from the shared `PlaybookCard` is
 * because this list is about *your relationship with* a playbook rather than
 * about the playbook:
 *
 * - the star is a control, not a badge;
 * - the second line is when *you* saved and tried it, not when it was verified;
 * - "Try again" replaces "Try" when the reader has tried it before, because the
 *   person reading this list has already done that once;
 * - "Did it work? Report" appears only where there is a try and no report.
 *
 * The evidence line is the same component the public cards use, so this page can
 * never show a success percentage the rest of the site would not.
 */
export function MeCard({
  item,
  now,
  tab,
  onUnsave,
  unsaving = false,
}: {
  item: MePlaybook;
  /** The instant the page was rendered, so "2d ago" cannot differ per row. */
  now: number;
  tab: "saved" | "tried" | "reported";
  /** Only the Saved tab can unsave; elsewhere the star is not a control. */
  onUnsave?: () => void;
  unsaving?: boolean;
}) {
  const tried = Boolean(item.triedAt);
  const reported = Boolean(item.reportedAt);

  const saved = formatRelativeDate(item.savedAt, now);
  const triedLabel = formatRelativeDate(item.triedAt, now);
  const reportedLabel = formatRelativeDate(item.reportedAt, now);

  return (
    <article
      className="flex flex-col rounded-2xl border border-border bg-card p-5"
      data-testid="me-card"
      data-slug={item.slug}
    >
      <div className="flex items-start gap-3">
        <span className="rounded-md bg-foreground px-2 py-0.5 text-xs font-medium text-background">
          {item.category.name}
        </span>

        {onUnsave ? (
          <button
            type="button"
            onClick={onUnsave}
            disabled={unsaving}
            aria-pressed={saved !== ""}
            aria-label={`Remove ${item.title} from saved`}
            data-testid="me-unsave"
            className="ml-auto inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-muse-soft text-muse transition-colors hover:bg-muse-line disabled:opacity-60"
          >
            {unsaving ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Star className="size-4 fill-muse" aria-hidden />
            )}
          </button>
        ) : null}
      </div>

      <h3 className="mt-3 text-lg font-semibold leading-snug">
        <Link href={`/p/${item.slug}`} className="hover:underline">
          {item.title}
        </Link>
      </h3>

      <p className="mt-1 text-sm text-muted-foreground">
        {item.promise || formatEvidenceHeadline(item.stats)}
      </p>

      <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        {saved ? <span>{`Saved ${saved}`}</span> : null}
        {saved && tried ? <span aria-hidden>·</span> : null}
        {tried && !reported ? <span>{`tried ${triedLabel}`}</span> : null}
        {reported ? (
          <span className="capitalize">{`reported ${reportedLabel}`}</span>
        ) : null}

        {item.updatedSinceSave ? (
          <span
            className="rounded-full bg-partly/15 px-2 py-0.5 font-medium text-partly"
            data-testid="me-updated-badge"
          >
            Updated since you saved
          </span>
        ) : null}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button asChild variant="outline" size="sm" className="rounded-full">
          <Link href={`/p/${item.slug}/try`}>
            <span aria-hidden>▶</span> {tried ? "Try again" : "Try"}
          </Link>
        </Button>

        {/* The one thing this list exists to nudge: a reader who tried something
            and never said how it went is the reason this site's numbers are
            thin. Shown exactly where it is actionable — tried, not reported. */}
        {tried && !reported ? (
          <Button
            asChild
            size="sm"
            className="rounded-full bg-foreground text-background hover:bg-foreground/90"
          >
            <Link href={`/p/${item.slug}/report`} data-testid="me-report-cta">
              Did it work? Report
            </Link>
          </Button>
        ) : null}

        {tab === "reported" && item.reportResult ? (
          <span className="rounded-full bg-muse-soft px-3 py-1 text-xs capitalize text-muse-dark">
            {item.reportResult === "didnt" ? "didn't work" : item.reportResult}
          </span>
        ) : null}
      </div>

      {/* The evidence line stays even when the promise is shown above, because a
          reader who saved something is deciding whether to trust it again. */}
      <p className="mt-3 text-xs text-muted-foreground">
        {formatEvidenceHeadline(item.stats)}
        {item.hasEvidence ? " · screenshot attached" : ""}
      </p>
    </article>
  );
}