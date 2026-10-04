"use client";

import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";

import { PlaybookCard } from "@/components/playbook-card";
import type { CategoryWithCount } from "@/server/queries/taxonomy";
import type { PlaybookWithRelations } from "@/server/queries/types";

/**
 * "Trending [category] playbooks" with an inline category switcher.
 *
 * The switch is client-side rather than a server action because the whole
 * catalogue is already in memory: re-fetching a slice of rows the browser was
 * sent anyway would cost a round trip to change which six cards are visible.
 * The prompt allows either; this is the one that does not flash.
 */
export function TrendingByCategory({
  playbooks,
  categories,
  agentCounts,
  now,
}: {
  playbooks: PlaybookWithRelations[];
  categories: CategoryWithCount[];
  agentCounts: Record<string, number>;
  now: number;
}) {
  const populated = useMemo(
    () => categories.filter((category) => playbooks.some((p) => p.category?.id === category.id)),
    [categories, playbooks],
  );

  const [activeSlug, setActiveSlug] = useState(populated[0]?.slug ?? "");

  const visible = useMemo(
    () => playbooks.filter((p) => p.category?.slug === activeSlug).slice(0, 6),
    [playbooks, activeSlug],
  );

  const active = populated.find((category) => category.slug === activeSlug);

  if (populated.length === 0) {
    return null;
  }

  return (
    <section aria-labelledby="trending-heading" className="mx-auto w-full max-w-6xl px-4">
      <div className="mb-4 flex items-center gap-3">
        <h2 id="trending-heading" className="text-2xl font-semibold tracking-tight">
          Trending
        </h2>

        <div className="relative">
          <select
            aria-label="Trending category"
            value={activeSlug}
            onChange={(event) => setActiveSlug(event.target.value)}
            className="appearance-none rounded-full border border-border bg-card py-2 pr-9 pl-4 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {populated.map((category) => (
              <option key={category.id} value={category.slug}>
                {category.name}
              </option>
            ))}
          </select>
          <ChevronDown
            aria-hidden
            className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
        </div>

        <span className="text-2xl font-semibold tracking-tight">playbooks</span>
      </div>

      {visible.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No playbooks in this category yet.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((playbook) => (
            <PlaybookCard
              key={playbook.id}
              playbook={playbook}
              density="compact"
              agentCount={Math.max(0, (agentCounts[playbook.id] ?? 1) - 1)}
              now={now}
            />
          ))}
        </div>
      )}

      {active ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Showing {visible.length} of {active.playbook_count} in {active.name}.
        </p>
      ) : null}
    </section>
  );
}