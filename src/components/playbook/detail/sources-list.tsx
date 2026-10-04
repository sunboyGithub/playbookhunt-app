import { ExternalLink } from "lucide-react";

/** Only what this component renders; see the note in `inputs-list.tsx`. */
type Source = {
  id: string;
  platform: string;
  handle: string | null;
  url: string | null;
  title: string | null;
};

/**
 * "Inspired by": the sources a playbook was built from.
 *
 * The link carries `rel="noopener nofollow ugc"`. The first two are the standard
 * hardening for a `target="_blank"` link; `ugc` marks it as user-submitted
 * content to search engines, which is exactly what it is — a handle someone
 * typed into a form. Without it a scraped handle in a source row reads as an
 * editorial endorsement from this site.
 *
 * Thank and Claim buttons are deliberately absent. The brief defers them to
 * phase 2, and rendering a dead control is worse than rendering none: it
 * promises a claim flow that does not exist.
 */
export function SourcesList({
  sources,
  triedCount,
}: {
  sources: Source[];
  /** Drives "Their idea helped N people try this." */
  triedCount: number;
}) {
  if (sources.length === 0) {
    return null;
  }

  return (
    <section aria-labelledby="sources-heading">
      <h2 id="sources-heading" className="text-sm font-semibold">
        Inspired by
      </h2>

      <ul className="mt-2 space-y-2">
        {sources.map((source) => (
          <li key={source.id} className="text-sm">
            <span className="text-muted-foreground">{source.platform}</span>
            {source.url ? (
              <a
                href={source.url}
                target="_blank"
                rel="noopener nofollow ugc"
                className="ml-1.5 inline-flex items-center gap-0.5 font-medium underline underline-offset-2 hover:text-brand"
              >
                {source.handle ?? source.title ?? source.url}
                <ExternalLink aria-hidden className="size-3" />
              </a>
            ) : (
              <span className="ml-1.5 font-medium">{source.handle ?? source.title ?? "—"}</span>
            )}
          </li>
        ))}
      </ul>

      <p className="mt-2 text-xs text-muted-foreground">
        Their idea helped {triedCount.toLocaleString("en-US")}{" "}
        {triedCount === 1 ? "person try" : "people try"} this.
      </p>
    </section>
  );
}