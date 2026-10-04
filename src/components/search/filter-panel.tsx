"use client";

import { useResultsParams } from "@/components/search/use-results-params";
import { MIN_REPORT_OPTIONS, TIME_BANDS, type TimeBand } from "@/lib/search/params";
import type { Agent } from "@/server/queries/types";
import { cn } from "@/lib/utils";

/**
 * The filter facets, as one list.
 *
 * Rendered twice — as a desktop sidebar and inside the mobile sheet — from the
 * same component, because AGENTS.md requires mobile parity down to identical
 * copy and states, and two hand-written copies of a filter list drift within one
 * milestone at the latest.
 *
 * Every control writes to the URL and nothing else. There is no Apply button,
 * because there is nothing to apply: the results already reflect every change.
 */

export type FilterPanelProps = {
  /**
   * Spelled out rather than `CategoryWithCount`, which lives in a `server-only`
   * module. Only these four fields cross into the client, and declaring them
   * locally is what keeps a client component from importing a server one.
   */
  categories: { slug: string; name: string; emoji: string; playbook_count: number }[];
  agents: { selectable: Agent[]; coming_soon: Agent[] };
  /** Hidden on a category page, which already fixes that facet. */
  showCategories?: boolean;
  /**
   * Called after any facet changes. The mobile sheet passes a closer here; on
   * desktop it is absent and the panel simply stays open.
   */
  onChange?: () => void;
};

export function FilterPanel({
  categories,
  agents,
  showCategories = true,
  onChange,
}: FilterPanelProps) {
  const { params, changeFacet: changeFacetAndNavigate } = useResultsParams();

  /**
   * Every facet goes through here so the sheet's close cannot be forgotten at a
   * call site — a facet that navigated but left the sheet open would hide the
   * results it just changed.
   */
  const changeFacet: typeof changeFacetAndNavigate = (facet, value, changes) => {
    changeFacetAndNavigate(facet, value, changes);
    onChange?.();
  };

  return (
    <div className="space-y-6">
      {showCategories ? (
        <FacetGroup label="Category" value={params.category ?? "all"}>
          <FacetChoice
            label="All categories"
            value="all"
            active={params.category === undefined}
            onSelect={() => changeFacet("category", "all", { category: null })}
          />
          {categories.map((category) => (
            <FacetChoice
              key={category.slug}
              label={`${category.emoji} ${category.name}`}
              count={category.playbook_count}
              value={category.slug}
              active={params.category === category.slug}
              onSelect={() =>
                changeFacet("category", category.slug, {
                  category: params.category === category.slug ? null : category.slug,
                })
              }
            />
          ))}
        </FacetGroup>
      ) : null}

      <FacetGroup label="Works with" value={params.agent ?? "all"}>
        <FacetChoice
          label="Any agent"
          value="all"
          active={params.agent === undefined}
          onSelect={() => changeFacet("agent", "all", { agent: null })}
        />
        {agents.selectable.map((agent) => (
          <FacetChoice
            key={agent.slug}
            label={agent.display_name}
            value={agent.slug}
            active={params.agent === agent.slug}
            onSelect={() =>
              changeFacet("agent", agent.slug, {
                agent: params.agent === agent.slug ? null : agent.slug,
              })
            }
          />
        ))}

        {/* Greyed and disabled, with no "Coming soon" text — AGENTS.md is
            explicit that the chip carries nothing beyond the agent's name. They
            are rendered rather than omitted so a reader who saw ChatGPT on a
            playbook detail page is not left wondering where it went.

            Rendered through FacetChoice rather than hand-written, so they carry
            the same 44px target and the same markup as every other choice. The
            native `disabled` attribute is also what tells a screen reader the
            agent cannot be picked — `aria-disabled` on the `li` did not, and is
            not a valid attribute for that role. */}
        {agents.coming_soon.map((agent) => (
          <FacetChoice
            key={agent.slug}
            label={agent.display_name}
            value={agent.slug}
            active={false}
            disabled
            onSelect={() => {}}
          />
        ))}
      </FacetGroup>

      <FacetGroup label="Verified within 30 days" value={params.verified === 30 ? "30" : "all"}>
        <FacetChoice
          label="Any time"
          value="all"
          active={params.verified === undefined}
          onSelect={() => changeFacet("verified", "all", { verified: null })}
        />
        <FacetChoice
          label="Last 30 days"
          value="30"
          active={params.verified === 30}
          onSelect={() =>
            changeFacet("verified", "30", {
              verified: params.verified === 30 ? null : 30,
            })
          }
        />
      </FacetGroup>

      <FacetGroup
        label="Minimum reports"
        value={params.minReports ? String(params.minReports) : "0"}
      >
        {MIN_REPORT_OPTIONS.map((option) => (
          <FacetChoice
            key={option}
            label={option === 0 ? "Any" : `${option}+ reports`}
            value={String(option)}
            active={(params.minReports ?? 0) === option}
            onSelect={() =>
              changeFacet("min_reports", String(option), {
                // 0 filters nothing, so it is stored as "no filter" rather than
                // as a value the URL would then carry forever.
                minReports: option === 0 ? null : option,
              })
            }
          />
        ))}
      </FacetGroup>

      <FacetGroup label="Time to complete" value={params.timeBand ?? "all"}>
        <FacetChoice
          label="Any length"
          value="all"
          active={params.timeBand === undefined}
          onSelect={() => changeFacet("time", "all", { timeBand: null })}
        />
        {(Object.keys(TIME_BANDS) as TimeBand[]).map((band) => (
          <FacetChoice
            key={band}
            label={TIME_BANDS[band].label}
            value={band}
            active={params.timeBand === band}
            onSelect={() =>
              changeFacet("time", band, {
                timeBand: params.timeBand === band ? null : band,
              })
            }
          />
        ))}
      </FacetGroup>

      <ClearFilters onChange={onChange} />
    </div>
  );
}

/** Reset to the default URL, keeping the query — a reader refining a search
 *  rarely wants their words discarded along with their filters. */
function ClearFilters({ onChange }: { onChange?: () => void }) {
  const { params, changeFacet } = useResultsParams();

  const hasFilters =
    params.category !== undefined ||
    params.agent !== undefined ||
    params.outcome !== undefined ||
    params.verified !== undefined ||
    params.minReports !== undefined ||
    params.timeBand !== undefined;

  if (!hasFilters) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={() => {
        changeFacet("all", "clear", {
          category: null,
          agent: null,
          outcome: null,
          verified: null,
          minReports: null,
          timeBand: null,
        });
        onChange?.();
      }}
      className="text-sm font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground"
    >
      Clear all filters
    </button>
  );
}

function FacetGroup({
  label,
  value,
  children,
}: {
  label: string;
  value: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-semibold">{label}</legend>
      {/* `data-value` carries the current choice so the Playwright filter test
          can assert which facet is active without depending on styling. */}
      <ul data-facet-value={value} className="space-y-0.5">
        {children}
      </ul>
    </fieldset>
  );
}

function FacetChoice({
  label,
  value,
  active,
  onSelect,
  count,
  disabled,
}: {
  label: string;
  value: string;
  active: boolean;
  onSelect: () => void;
  count?: number;
  disabled?: boolean;
}) {
  return (
    <li>
      <button
        type="button"
        value={value}
        // Stable per-facet hook. The role of this control changes with the
        // viewport (sidebar on desktop, portal on mobile) and the modal's
        // aria-hidden handling makes a role-based locator unreliable inside
        // the sheet, so tests select by this rather than by accessible name.
        data-facet={value}
        aria-pressed={active}
        disabled={disabled}
        onClick={onSelect}
        className={cn(
          // 44px minimum touch target, per the mobile-parity rule.
          "flex min-h-11 w-full items-center justify-between gap-2 rounded-lg px-3 text-left text-sm transition-colors",
          active ? "bg-accent font-medium text-foreground" : "hover:bg-accent/60",
          disabled && "cursor-not-allowed opacity-50",
        )}
      >
        <span>{label}</span>
        {count !== undefined ? (
          <span className="shrink-0 text-xs text-muted-foreground">{count}</span>
        ) : null}
      </button>
    </li>
  );
}