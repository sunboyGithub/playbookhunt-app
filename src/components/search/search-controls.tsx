"use client";

import { LayoutGrid, List, Search } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useResultsParams } from "@/components/search/use-results-params";
import { OUTCOME_PILLS, type OutcomePill, type ViewMode } from "@/lib/search/params";
import { SORT_OPTIONS, type SortOption } from "@/server/queries/types";
import { cn } from "@/lib/utils";

/**
 * The toolbar above the results: query, outcome pills, sort and view.
 *
 * All client, all URL-driven — see `use-results-params` for why none of this is
 * local state. The server component above renders the results these controls
 * describe, so the two cannot disagree about what is being shown.
 */

export function SearchQueryInput({
  className,
  autoFocus,
}: {
  className?: string;
  autoFocus?: boolean;
}) {
  const { params, submitQuery, isPending } = useResultsParams();
  const [value, setValue] = useState(params.q);

  return (
    <form
      role="search"
      className={cn(
        "flex w-full items-center gap-2 rounded-full border border-border bg-card p-1.5 pl-5 shadow-sm focus-within:ring-2 focus-within:ring-ring",
        className,
      )}
      onSubmit={(event) => {
        event.preventDefault();
        submitQuery(value);
      }}
    >
      <Search aria-hidden className="size-5 shrink-0 text-muted-foreground" />
      <input
        type="search"
        name="q"
        value={value}
        // `autoFocus` is opt-in so a shared URL with `?q=` does not steal focus
        // on load; the homepage search field links here rather than focusing it.
        autoFocus={autoFocus}
        aria-label="Search playbooks"
        placeholder="What are you trying to do?"
        onChange={(event) => setValue(event.target.value)}
        className="h-11 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
      />
      <Button
        type="submit"
        disabled={isPending}
        className="h-11 rounded-full bg-brand px-6 text-white hover:bg-brand/90"
      >
        Search
      </Button>
    </form>
  );
}

/**
 * All · Save money · Save time · Plan · Research · Create
 *
 * "All" clears the outcome facet rather than pointing at a special value, so
 * there is one way to express "no outcome filter" and it is its absence.
 */
export function OutcomePills() {
  const { params, changeFacet } = useResultsParams();

  return (
    <div
      role="group"
      aria-label="Filter by outcome"
      className="flex flex-wrap items-center gap-2"
    >
      <OutcomePillButton
        label="All"
        active={params.outcome === undefined}
        onClick={() => changeFacet("outcome", "all", { outcome: null })}
      />
      {OUTCOME_PILLS.map((pill) => (
        <OutcomePillButton
          key={pill.value}
          label={pill.label}
          active={params.outcome === pill.value}
          onClick={() =>
            changeFacet("outcome", pill.value, {
              // Tapping the active pill clears it, which is what the second tap
              // on any toggle in this app means.
              outcome: params.outcome === pill.value ? null : (pill.value as OutcomePill),
            })
          }
        />
      ))}
    </div>
  );
}

function OutcomePillButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant={active ? "default" : "outline"}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "h-9 rounded-full px-4",
        active && "bg-foreground text-background hover:bg-foreground/90",
      )}
    >
      {label}
    </Button>
  );
}

const SORT_LABELS: Record<SortOption, string> = {
  best_evidence: "Best evidence",
  most_tried: "Most tried",
  highest_outcome: "Highest outcome",
  recently_verified: "Recently verified",
  trending: "Trending",
};

/**
 * Sort order.
 *
 * A native `<select>` rather than a custom listbox. It is keyboard-accessible and
 * screen-reader-correct with no ARIA to maintain, it gets the platform's own
 * picker on a phone — which is what a reader on a small screen expects — and the
 * result set is the same list the brief gives, so a bespoke menu would add risk
 * without adding capability.
 */
export function SortSelect() {
  const { params, changeFacet } = useResultsParams();

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="sort" className="text-sm text-muted-foreground">
        Sort
      </label>
      <select
        id="sort"
        value={params.sort}
        onChange={(event) =>
          changeFacet("sort", event.target.value, { sort: event.target.value as SortOption })
        }
        className="h-9 rounded-lg border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {SORT_OPTIONS.map((option) => (
          <option key={option} value={option}>
            {SORT_LABELS[option]}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Cards (a compact grid) or list (row density). */
export function ViewToggle() {
  const { params, navigate } = useResultsParams();

  const set = (view: ViewMode) => {
    if (params.view === view) {
      return;
    }
    // Replaces rather than pushes: switching density is not a result set, and
    // Back should return to the previous search rather than to the previous
    // button state.
    navigate({ view }, { replace: true });
  };

  return (
    <div role="group" aria-label="Result layout" className="flex items-center gap-1">
      <Button
        type="button"
        variant={params.view === "cards" ? "secondary" : "ghost"}
        aria-pressed={params.view === "cards"}
        aria-label="Card view"
        onClick={() => set("cards")}
        className="size-9 rounded-lg p-0"
      >
        <LayoutGrid aria-hidden className="size-4" />
      </Button>
      <Button
        type="button"
        variant={params.view === "list" ? "secondary" : "ghost"}
        aria-pressed={params.view === "list"}
        aria-label="List view"
        onClick={() => set("list")}
        className="size-9 rounded-lg p-0"
      >
        <List aria-hidden className="size-4" />
      </Button>
    </div>
  );
}