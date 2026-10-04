import Link from "next/link";

import { PlaybookCard } from "@/components/playbook-card";
import { Button } from "@/components/ui/button";
import { formatCount, formatHours, formatMoney } from "@/lib/stats/format";
import { HERO_QUICK_LINKS, museReferralNote } from "@/lib/site-config";
import type { CategoryWithCount, CollectionWithItems } from "@/server/queries/taxonomy";
import type { PlaybookWithRelations, PublicReport } from "@/server/queries/types";

/*
 * Server-rendered homepage sections.
 *
 * These take already-fetched rows and render them, with no client JavaScript
 * beyond the three interactive sections. Keeping them server components is what
 * lets the whole homepage arrive in one payload: the prompt forbids per-section
 * skeletons, which only works if the sections are not independently loading.
 */

/**
 * A single report's headline, from the values it actually carries.
 *
 * `public_reports` gives amount, unit and hours_saved but not the playbook's
 * outcome_type, so the unit is used as filed rather than inferred. An outcome
 * with no amount says so plainly — never a placeholder number, and not the
 * result word again, which the badge beside it already shows.
 */
function describeOutcome(outcome: PublicReport): string {
  if (outcome.amount !== null && outcome.amount !== undefined) {
    return `${formatMoney(outcome.amount)}${outcome.unit ?? ""}`;
  }
  if (outcome.hours_saved !== null && outcome.hours_saved !== undefined) {
    return formatHours(outcome.hours_saved);
  }
  return "Result recorded";
}

export function SectionHeading({
  id,
  title,
  children,
  action,
}: {
  /** Set when the section uses `aria-labelledby`, so the reference resolves. */
  id?: string;
  title: string;
  children?: React.ReactNode;
  action?: { label: string; href: string };
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <h2 id={id} className="text-2xl font-semibold tracking-tight">
        {title}
      </h2>
      {children}
      {action ? (
        <Link
          href={action.href}
          className="ml-auto text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          {action.label} →
        </Link>
      ) : null}
    </div>
  );
}

/**
 * "Proven to work", or "Recently verified" when nothing clears the bar.
 *
 * The label changes with the data rather than the data being padded to fit the
 * label. Showing three cards under "Proven to work" that have 9 reports each
 * would be the single most misleading thing this page could do.
 */
export function ProvenRow({
  playbooks,
  isFallback,
  agentCounts,
  now,
}: {
  playbooks: PlaybookWithRelations[];
  isFallback: boolean;
  agentCounts: Record<string, number>;
  now: number;
}) {
  if (playbooks.length === 0) {
    return (
      <section className="mx-auto w-full max-w-6xl px-4">
        <SectionHeading id="proven-heading" title="Proven to work" />
        <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No playbooks have been published yet.
        </p>
      </section>
    );
  }

  return (
    <section className="mx-auto w-full max-w-6xl px-4" aria-labelledby="proven-heading">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 id="proven-heading" className="text-2xl font-semibold tracking-tight">
          {isFallback ? "Recently verified" : "Proven to work"}
        </h2>
        <span className="rounded-full bg-verified-bg px-3 py-1 text-xs font-medium">
          {isFallback ? "Verified recently" : "Backed by verified results"}
        </span>
        <Link
          href="/playbooks"
          className="ml-auto text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          See all →
        </Link>
      </div>

      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {playbooks.map((playbook) => (
          <PlaybookCard
            key={playbook.id}
            playbook={playbook}
            density="rich"
            agentCount={Math.max(0, (agentCounts[playbook.id] ?? 1) - 1)}
            now={now}
          />
        ))}
      </div>
    </section>
  );
}

/**
 * The most-proven playbooks — a numbered list ordered by `evidence_score`.
 *
 * Named for what it orders rather than for a period it does not measure: the
 * score is all-time, so a "this week" heading would claim a weekly figure the
 * data cannot produce. `trending_score` is the weekly notion and is empty until
 * the P9 job writes it.
 */
export function TopPlaybooks({ playbooks, now }: { playbooks: PlaybookWithRelations[]; now: number }) {
  if (playbooks.length === 0) {
    return null;
  }

  return (
    <section className="mx-auto w-full max-w-6xl px-4" aria-labelledby="top-heading">
      <SectionHeading
        id="top-heading"
        title="Most proven"
        action={{ label: "Ranked by evidence", href: "/playbooks?sort=best_evidence" }}
      />
      <div className="divide-y divide-border rounded-xl border border-border bg-card px-4">
        {playbooks.map((playbook, index) => (
          <PlaybookCard key={playbook.id} playbook={playbook} density="row" rank={index + 1} now={now} />
        ))}
      </div>
    </section>
  );
}

/** Category chips under the hero. */
export function CategoryChips({ categories }: { categories: CategoryWithCount[] }) {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-wrap justify-center gap-2 px-4">
      {categories.map((category) => (
        <Link
          key={category.id}
          href={`/c/${category.slug}`}
          className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm transition-colors hover:bg-muted"
        >
          {/* Same emoji the category cards and filter facets use, so the chip
              and the page it links to are recognisably the same category.
              `aria-hidden` because the name follows it directly — announcing
              "money bag" before "Personal finance" is noise. */}
          <span aria-hidden>{category.emoji}</span>
          {category.name}
        </Link>
      ))}
    </div>
  );
}

/** Hero quick links: sort views. */
export function QuickLinks() {
  return (
    <div className="flex flex-wrap justify-center gap-x-6 gap-y-2">
      {HERO_QUICK_LINKS.map((link) => (
        <Link key={link.href} href={link.href} className="text-sm text-muted-foreground hover:text-foreground">
          {link.label}
        </Link>
      ))}
    </div>
  );
}

/**
 * The hero counter.
 *
 * The results half is omitted when it is zero rather than shown as "0 results
 * reported" — an empty figure reads as a measurement, and there has been none.
 */
export function HeroCounter({ playbooks, reports }: { playbooks: number; reports: number }) {
  return (
    <p className="text-sm text-muted-foreground">
      {formatCount(playbooks)} playbooks
      {reports > 0 ? (
        <>
          {" · "}
          <span className="font-semibold text-brand">{formatCount(reports)} real results</span> reported
        </>
      ) : null}
    </p>
  );
}

/**
 * Starter kits. The illustration occupies the right third, per the frame.
 *
 * `illustration_url` is empty until an illustration is authored, so the slot
 * falls back to the category tint rather than collapsing the card — a kit whose
 * card changes width depending on artwork is worse than a consistent tint.
 */
export function StarterKits({ kits }: { kits: CollectionWithItems[] }) {
  if (kits.length === 0) {
    return null;
  }

  return (
    <section className="mx-auto w-full max-w-6xl px-4" aria-labelledby="kits-heading">
      <SectionHeading
        id="kits-heading"
        title="Starter kits"
        action={{ label: "Browse all kits", href: "/kits" }}
      />
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {kits.map((kit) => (
          <Link
            key={kit.id}
            href={`/k/${kit.slug}`}
            className="group flex overflow-hidden rounded-xl border border-border bg-card transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className="flex flex-1 flex-col gap-2 p-5">
              <h3 className="font-semibold">{kit.title}</h3>
              <p className="line-clamp-2 text-sm text-muted-foreground">{kit.blurb}</p>
              <p className="mt-auto pt-3 text-sm font-medium">
                {kit.playbook_ids.length} playbook{kit.playbook_ids.length === 1 ? "" : "s"}
              </p>
            </div>
            <div className="w-1/3 shrink-0 border-l border-border bg-tint-mint">
              {kit.illustration_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={kit.illustration_url}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="size-full object-cover"
                />
              ) : null}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

/**
 * "Tried an AI playbook? Report your result."
 *
 * The referral note renders only when `museReferralNote()` returns something,
 * which it does not until Muse's official terms URL is supplied. AGENTS.md
 * requires a link to those terms wherever a referral code is shown, and a note
 * without one would be a commercial claim with no terms attached.
 */
export function ReportCta({ outcomes }: { outcomes: PublicReport[] }) {
  const referral = museReferralNote();

  return (
    <section className="mx-auto w-full max-w-6xl px-4" aria-labelledby="report-cta-heading">
      <div className="grid items-center gap-8 rounded-2xl border border-border bg-card p-8 md:grid-cols-2">
        <div className="space-y-3">
          {outcomes.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              No approved results yet. Yours would be the first.
            </p>
          ) : (
            outcomes.map((outcome, index) => {
              // This is one person's report, not an aggregate, so the
              // report-threshold rules do not apply and there is nothing to
              // compute. It shows the amount that was actually filed — and
              // nothing at all when the reporter left the amount blank.
              const headline = describeOutcome(outcome);

              return (
                <div
                  key={outcome.id}
                  className="w-fit max-w-full rounded-xl border border-border bg-background p-3 shadow-sm"
                  style={{ marginLeft: `${index * 12}%` }}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        outcome.result === "worked"
                          ? "bg-verified-bg text-foreground"
                          : outcome.result === "partly"
                            ? "bg-tint-peach text-foreground"
                            : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {outcome.result}
                    </span>
                    <span className="text-sm font-semibold">{headline}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {outcome.created_at ? new Date(outcome.created_at).toLocaleDateString("en-US") : ""}
                  </p>
                </div>
              );
            })
          )}
        </div>

        <div>
          <h2 id="report-cta-heading" className="text-3xl font-semibold tracking-tight">
            <span className="text-brand">Tried an AI playbook?</span>
            <br />
            Report your result.
          </h2>
          <p className="mt-3 text-muted-foreground">
            Takes 30 seconds. Every report makes the rankings more honest for the next person.
          </p>

          {referral ? (
            <p className="mt-4 rounded-xl bg-tint-lavender p-4 text-sm text-muse">
              {referral.note}{" "}
              <Link href={referral.termsUrl} className="underline">
                Terms
              </Link>
              <span className="mt-1 block text-xs text-muted-foreground">{referral.footnote}</span>
            </p>
          ) : null}

          <Button asChild className="mt-5 rounded-full bg-brand px-6 text-white hover:bg-brand/90">
            <Link href="/report">Report a result</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
