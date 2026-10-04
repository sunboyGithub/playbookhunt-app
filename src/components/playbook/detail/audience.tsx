import Link from "next/link";
import { Check, X } from "lucide-react";

import { Button } from "@/components/ui/button";

/** Only what the steps list renders; see the note in `inputs-list.tsx`. */
type Step = { id: string; body: string };

/**
 * "Who this is for" / "Who this is NOT for".
 *
 * The negative list matters more than the positive one and is placed directly
 * beneath it rather than in a footnote. A playbook that quietly excludes half
 * its readers costs them an hour before they find out; a page that says up front
 * "not for you if you need a binding quote" saves them that hour. Putting the
 * two side by side also stops the positive list reading as marketing.
 */
export function Audience({
  whoFor,
  whoNotFor,
}: {
  whoFor: string | null;
  whoNotFor: string | null;
}) {
  if (!whoFor && !whoNotFor) {
    return null;
  }

  return (
    <section aria-labelledby="audience-heading" className="grid gap-4 sm:grid-cols-2">
      <h2 id="audience-heading" className="sr-only">
        Who this is for
      </h2>

      {whoFor ? (
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Check aria-hidden className="size-4 text-worked" />
            Who this is for
          </h3>
          <p className="mt-1.5 text-sm text-muted-foreground">{whoFor}</p>
        </div>
      ) : null}

      {whoNotFor ? (
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <X aria-hidden className="size-4 text-didnt" />
            Who this is NOT for
          </h3>
          <p className="mt-1.5 text-sm text-muted-foreground">{whoNotFor}</p>
        </div>
      ) : null}
    </section>
  );
}

/**
 * The numbered steps.
 *
 * An `<ol>` rather than a styled `<ul>`, so the numbering is in the
 * accessibility tree as an ordered list and a screen reader announces "list of
 * four items" before reading the first one. The visible numbers are generated
 * by CSS, which keeps the DOM free of a counter that could disagree with the
 * real order after an edit.
 */
export function Steps({ steps }: { steps: Step[] }) {
  if (steps.length === 0) {
    return null;
  }

  return (
    <section aria-labelledby="steps-heading">
      <h2 id="steps-heading" className="text-lg font-semibold">
        Steps
      </h2>
      <ol className="steps mt-3 space-y-2">
        {steps.map((step) => (
          <li key={step.id} className="flex gap-3 text-sm">
            <span
              aria-hidden
              className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand/10 text-xs font-semibold text-brand"
            >
              <span className="steps-counter" />
            </span>
            <span className="pt-0.5">{step.body}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/**
 * The outcome preview image, when there is one.
 *
 * The caption says "redacted" because that is what the promise is: readers are
 * shown what a result looks like with identifying details removed. It is not
 * decoration — an image of someone's savings screen with no such note invites
 * the reader to assume the numbers shown are typical, which is the one thing
 * this page must never imply.
 */
export function OutcomePreview({ url, title }: { url: string | null; title: string }) {
  if (!url) {
    return null;
  }

  return (
    <figure className="overflow-hidden rounded-xl border border-border bg-card">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={`Example result for ${title}, with identifying details removed`}
        loading="lazy"
        decoding="async"
        className="w-full object-cover"
      />
      <figcaption className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
        Example result (redacted)
      </figcaption>
    </figure>
  );
}

/**
 * "Did it work for you?" — the call to report a result.
 *
 * Placed after the evidence rather than before it, so a reader has just seen
 * other people's outcomes and is being asked for their own. Asking first reads
 * as a request for free labour.
 */
export function ReportCta() {
  return (
    <section
      aria-labelledby="did-it-work-heading"
      className="rounded-2xl border border-border bg-card p-6"
    >
      <h2 id="did-it-work-heading" className="text-lg font-semibold">
        Did it work for you?
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Takes 30 seconds. Your report is the only way the next person finds out.
      </p>
      <Button asChild className="mt-4 rounded-full bg-brand px-6 text-white hover:bg-brand/90">
        <Link href="/report">Report your result</Link>
      </Button>
    </section>
  );
}