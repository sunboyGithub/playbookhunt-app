"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { formatMedianOutcome, formatSuccessRateFrom, toOutcomeStats } from "@/lib/stats/format";
import type { CategoryWithCount } from "@/server/queries/taxonomy";
import type { PlaybookWithRelations } from "@/server/queries/types";

/**
 * "Explore by category": the category list on the left, a grid of six tiles on
 * the right, switching client-side.
 *
 * The tiles are a denser shape than the compact card — the frame shows a title
 * and a single evidence line, with no agent row — so they are built here rather
 * than bolted onto `PlaybookCard` as a fourth density. The evidence still comes
 * from the shared formatter, so a percentage cannot appear here at 9 reports
 * when it would not appear on a card.
 */
export function CategoryExplorer({
  playbooks,
  categories,
}: {
  playbooks: PlaybookWithRelations[];
  categories: CategoryWithCount[];
}) {
  const [activeSlug, setActiveSlug] = useState(categories[0]?.slug ?? "");

  const visible = useMemo(
    () => playbooks.filter((p) => p.category?.slug === activeSlug).slice(0, 6),
    [playbooks, activeSlug],
  );

  return (
    <section aria-labelledby="explore-heading" className="mx-auto w-full max-w-6xl px-4">
      <h2 id="explore-heading" className="mb-4 text-2xl font-semibold tracking-tight">
        Explore by category
      </h2>

      <div className="grid gap-8 md:grid-cols-[260px_1fr]">
        <ul className="space-y-1">
          {categories.map((category) => {
            const isActive = category.slug === activeSlug;
            return (
              <li key={category.id}>
                <button
                  type="button"
                  onClick={() => setActiveSlug(category.slug)}
                  aria-pressed={isActive}
                  className={`flex w-full items-center justify-between rounded-lg border px-4 py-2.5 text-left text-sm transition-colors ${
                    isActive
                      ? "border-brand text-brand"
                      : "border-transparent text-foreground hover:bg-muted/50"
                  }`}
                >
                  {category.name}
                  <span className="text-xs text-muted-foreground">{category.playbook_count}</span>
                </button>
              </li>
            );
          })}
        </ul>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.length === 0 ? (
            <p className="col-span-full rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              Nothing here yet — this category has no published playbooks.
            </p>
          ) : (
            visible.map((playbook) => {
              const stats = toOutcomeStats(playbook);
              const rate = formatSuccessRateFrom(stats);
              const median = formatMedianOutcome(stats);

              return (
                <Link
                  key={playbook.id}
                  href={`/p/${playbook.slug}`}
                  data-testid="playbook-card"
                  data-density="tile"
                  className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <h3 className="line-clamp-2 text-sm font-medium leading-snug">{playbook.title}</h3>
                  {/* Same threshold rule as every other surface: below 20
                      reports this is the "Early" pill, not a percentage. */}
                  {rate.kind === "rate" ? (
                    <p className="text-xs text-muted-foreground">
                      <span className="font-semibold text-worked">{rate.percent}%</span> ({rate.n})
                      {median ? ` · ${median}` : ""}
                    </p>
                  ) : (
                    <p>
                      <span className="inline-block rounded-full bg-muted px-2 py-1 text-[11px] text-muted-foreground">
                        Early · {rate.reports} reports
                      </span>
                    </p>
                  )}
                </Link>
              );
            })
          )}
        </div>
      </div>
    </section>
  );
}
