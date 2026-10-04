import { last30Line, workedBreakdown, type DetailStats } from "@/lib/stats/detail";

/**
 * "What happened for others": the worked / partly / didn't bar.
 *
 * Two accessibility decisions worth stating, because both are easy to get wrong
 * in a way that looks fine:
 *
 * - The bar is `aria-hidden` and carries `altText` in a visually hidden
 *   paragraph next to it. The bar is three coloured divs; a screen reader would
 *   otherwise announce nothing at all, since width and colour carry the entire
 *   message.
 * - The legend is a real `<ul>` with the count beside each percentage, so the
 *   numbers are readable as text and not only as geometry.
 */
export function WorkedBar({
  stats,
  reportsInLast30Days,
}: {
  stats: DetailStats;
  /** Counted separately; see `lib/stats/detail` for why. */
  reportsInLast30Days: number;
}) {
  const breakdown = workedBreakdown(stats);
  const last30 = last30Line(stats, reportsInLast30Days);

  return (
    <section aria-labelledby="worked-heading">
      <h2 id="worked-heading" className="text-lg font-semibold">
        What happened for others
      </h2>

      {breakdown.kind === "empty" ? (
        <p className="mt-3 rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {breakdown.message}
        </p>
      ) : (
        <div className="mt-4">
          <div
            aria-hidden
            className="flex h-3 overflow-hidden rounded-full bg-muted"
            data-testid="worked-bar"
          >
            {breakdown.segments
              .filter((segment) => segment.count > 0)
              .map((segment) => (
                <span
                  key={segment.key}
                  style={{ width: `${segment.width}%` }}
                  className={
                    segment.key === "worked"
                      ? "bg-worked"
                      : segment.key === "partly"
                        ? "bg-partly"
                        : "bg-didnt"
                  }
                />
              ))}
          </div>

          {/* The text alternative. Hidden visually, read aloud. */}
          <p className="sr-only">{breakdown.altText}</p>

          <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
            {breakdown.segments.map((segment) => (
              <li key={segment.key} className="flex items-center gap-2">
                <span
                  aria-hidden
                  className={`size-2.5 rounded-full ${
                    segment.key === "worked"
                      ? "bg-worked"
                      : segment.key === "partly"
                        ? "bg-partly"
                        : "bg-didnt"
                  }`}
                />
                <span className="text-muted-foreground">{segment.label}</span>
                <span className="font-medium tabular-nums">
                  {segment.percent}% ({segment.count})
                </span>
              </li>
            ))}
          </ul>

          {last30 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              <span className="font-semibold text-foreground tabular-nums">
                {last30.percent}%
              </span>{" "}
              worked {last30.caption}
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}