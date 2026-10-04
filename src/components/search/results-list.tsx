import Link from "next/link";

import { PlaybookCard } from "@/components/playbook-card";
import { buildResultsHref, type ResultsParams } from "@/lib/search/params";
import type { PlaybookWithRelations } from "@/server/queries/types";
import { cn } from "@/lib/utils";

/**
 * The result cards themselves.
 *
 * A server component: the rows are already loaded, so rendering them in the
 * client would ship every evidence number to the browser only to draw it once
 * with no interactivity. The card grid carries no state.
 *
 * `now` is passed down rather than read here. Reading the clock during render is
 * impure, and — more usefully — one timestamp per page is what makes every
 * "3d ago" on a page describe the same moment.
 */
export function ResultsList({
  playbooks,
  view,
  now,
  params,
}: {
  playbooks: PlaybookWithRelations[];
  view: ResultsParams["view"];
  now: number;
  params: ResultsParams;
}) {
  if (view === "list") {
    return (
      <div className="divide-y divide-border rounded-xl border border-border bg-card">
        {playbooks.map((playbook, index) => (
          <PlaybookCard
            key={playbook.id}
            playbook={playbook}
            density="row"
            rank={(params.page - 1) * 24 + index + 1}
            now={now}
          />
        ))}
      </div>
    );
  }

  return (
    <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {playbooks.map((playbook) => (
        <li key={playbook.id}>
          <PlaybookCard playbook={playbook} density="compact" now={now} />
        </li>
      ))}
    </ul>
  );
}

/**
 * How many playbooks were found, phrased so a filtered result never reads as a
 * promise.
 *
 * `aria-live="polite"` because this line changes when a filter is applied and
 * nothing else on the page says so out loud — a screen-reader user would
 * otherwise have no confirmation that a filter did anything.
 */
export function ResultCount({ total, query }: { total: number; query: string }) {
  const noun = total === 1 ? "playbook" : "playbooks";

  return (
    <p aria-live="polite" className="text-sm text-muted-foreground">
      {/* Counts only, even at zero. The prose belongs to the empty state
          below, and this line said the same sentence — so a failed search
          printed "No playbooks yet for …" twice, in two different type sizes,
          directly above each other. */}
      {total} {noun}
      {query ? ` for “${query}”` : ""}
    </p>
  );
}

/**
 * The category substitution notice.
 *
 * Required, not optional polish. The category fallback silently puts rows in
 * front of a reader that text search did not find, and a reader who did not
 * know that would be looking at Personal finance results while wondering why
 * their search for something else brought them here. It is the difference
 * between the fallback being helpful and the fallback being a lie.
 *
 * Renders nothing when there was no substitution, so it can be called
 * unconditionally.
 */
export function MatchedCategoryNotice({
  matched,
  className,
}: {
  matched: { slug: string; name: string; keywords: string[] } | null;
  className?: string;
}) {
  if (!matched) {
    return null;
  }

  // The reader's own words, in their own order, not the keyword that matched.
  // "Matched: bills → Personal finance" says what happened; "Matched: internet
  // bill, saving → Personal finance" says what the software thinks.
  const quoted = matched.keywords.map((word) => `“${word}”`).join(", ");

  return (
    <p
      data-testid="matched-category"
      className={cn(
        "rounded-lg bg-accent/60 px-3 py-2 text-sm text-muted-foreground",
        className,
      )}
    >
      Matched: {quoted} →{" "}
      <Link href={`/c/${matched.slug}`} className="font-medium text-foreground underline underline-offset-4">
        {matched.name}
      </Link>
    </p>
  );
}

/**
 * Page links.
 *
 * Real `<Link>`s to real URLs rather than buttons that push history. The whole
 * point of URL-driven filters is that a result page is a place you can be sent
 * to, and page links that only work after React has hydrated break that for
 * anyone arriving on page 2 from a search engine or a shared link.
 */
export function Pagination({
  page,
  pageCount,
  basePath,
  params,
}: {
  page: number;
  pageCount: number;
  basePath: string;
  params: ResultsParams;
}) {
  if (pageCount <= 1) {
    return null;
  }

  const linkFor = (target: number) =>
    buildResultsHref(basePath, params, { page: target === 1 ? null : target });

  return (
    <nav aria-label="Pagination" className="flex items-center justify-center gap-2 pt-8">
      <Link
        href={linkFor(Math.max(1, page - 1))}
        aria-disabled={page === 1}
        scroll={false}
        className={cn(
          "inline-flex h-9 items-center rounded-full border border-border px-4 text-sm",
          page === 1 ? "pointer-events-none opacity-40" : "hover:bg-accent",
        )}
      >
        Previous
      </Link>

      <span className="px-2 text-sm text-muted-foreground">
        Page {page} of {pageCount}
      </span>

      <Link
        href={linkFor(Math.min(pageCount, page + 1))}
        aria-disabled={page === pageCount}
        scroll={false}
        className={cn(
          "inline-flex h-9 items-center rounded-full border border-border px-4 text-sm",
          page === pageCount ? "pointer-events-none opacity-40" : "hover:bg-accent",
        )}
      >
        Next
      </Link>
    </nav>
  );
}