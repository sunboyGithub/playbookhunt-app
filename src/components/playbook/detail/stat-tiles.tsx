import { medianTile, triedTile, workedTile, type DetailStats } from "@/lib/stats/detail";

/**
 * The three stat tiles at the top of a detail page.
 *
 * A server component with no client JavaScript: these numbers are decided
 * server-side by `lib/stats/detail`, and a reader who never scrolls this far
 * should not have downloaded the code that draws it.
 *
 * The median tile is *omitted* rather than rendered empty when there is no
 * median — see `medianTile`, whose "hidden" result exists so this component has
 * no way to print "Median —".
 */
export function StatTiles({ stats }: { stats: DetailStats }) {
  const tried = triedTile(stats);
  const worked = workedTile(stats);
  const median = medianTile(stats);

  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <div className="rounded-xl border border-border bg-card p-4">
        <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Tried
        </dt>
        <dd className="mt-1 text-2xl font-semibold tabular-nums">{tried.value}</dd>
        <dd className="mt-0.5 text-xs text-muted-foreground">{tried.caption}</dd>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Worked
        </dt>
        <dd className="mt-1 text-2xl font-semibold tabular-nums">
          {worked.kind === "rate" ? `${worked.percent}%` : "—"}
        </dd>
        {/* The caption is what says "Early", so the dash above is never the only
            thing a reader sees: the line under it explains that the number is
            withheld and how many reports arrived instead. */}
        <dd
          className={`mt-0.5 text-xs ${
            worked.kind === "rate" ? "text-muted-foreground" : "font-medium text-brand"
          }`}
        >
          {worked.caption}
        </dd>
      </div>

      {median.kind === "value" ? (
        <div className="col-span-2 rounded-xl border border-border bg-card p-4 sm:col-span-1">
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Median saved
          </dt>
          <dd className="mt-1 text-2xl font-semibold tabular-nums">{median.text}</dd>
          <dd className="mt-0.5 text-xs text-muted-foreground">{median.caption}</dd>
        </div>
      ) : null}
    </dl>
  );
}