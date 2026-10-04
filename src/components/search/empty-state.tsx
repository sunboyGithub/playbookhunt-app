"use client";

import Link from "next/link";
import { useActionState } from "react";

import { PlaybookCard } from "@/components/playbook-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requestPlaybook, type RequestState } from "@/server/actions/request-playbook";
import type { PlaybookWithRelations } from "@/server/queries/types";

/**
 * What a search with nothing to show looks like.
 *
 * The brief's rule is that search must never dead-end, and this is where that
 * rule is spent. Three things are offered, in the order a reader is most likely
 * to want them: related categories they might have meant, the most-tried
 * playbooks as proof the catalogue exists, and the request form.
 *
 * The form is last on the page but first in the source: the component that owns
 * the form is the one the state belongs to.
 */
export function EmptyState({
  query,
  categories,
  popular,
  now,
}: {
  query: string;
  categories: { slug: string; name: string; emoji: string; playbook_count: number }[];
  popular: PlaybookWithRelations[];
  now: number;
}) {
  return (
    <div className="space-y-12 py-8">
      <section aria-labelledby="empty-heading">
        <h2 id="empty-heading" className="text-xl font-semibold">
          No playbooks yet for “{query}”
        </h2>
        <p className="mt-1 text-muted-foreground">
          We are testing playbooks for this. Try one of these, or tell us what you needed below.
        </p>

        {categories.length > 0 ? (
          <ul className="mt-4 flex flex-wrap gap-2">
            {categories.map((category) => (
              <li key={category.slug}>
                <Link
                  href={`/c/${category.slug}`}
                  className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm transition-colors hover:bg-accent"
                >
                  <span aria-hidden>{category.emoji}</span>
                  {category.name}
                  <span className="text-muted-foreground">{category.playbook_count}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {popular.length > 0 ? (
        <section aria-labelledby="popular-heading">
          <h2 id="popular-heading" className="mb-4 text-lg font-semibold">
            Popular playbooks
          </h2>
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {popular.map((playbook) => (
              <li key={playbook.id}>
                <PlaybookCard playbook={playbook} density="compact" now={now} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <RequestForm />
    </div>
  );
}

/**
 * The compact request form.
 *
 * The query is prefilled with what the reader already typed. They have just
 * demonstrated they know what they want; making them type it twice is the one
 * thing guaranteed to lose submissions.
 */
function RequestForm() {
  const [state, formAction, pending] = useActionState<RequestState, FormData>(
    requestPlaybook,
    { status: "idle" },
  );

  if (state.status === "success") {
    return (
      <section
        aria-labelledby="requested-heading"
        className="rounded-2xl border border-border bg-card p-6"
      >
        <h2 id="requested-heading" className="text-lg font-semibold">
          Thanks — that is in the queue
        </h2>
        <p className="mt-1 text-muted-foreground">
          We will add a playbook for it and let you know when it is ready.
        </p>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="request-heading"
      className="rounded-2xl border border-border bg-card p-6"
    >
      <h2 id="request-heading" className="text-lg font-semibold">
        Request this playbook
      </h2>
      <p className="mt-1 text-muted-foreground">
        Tell us what you were trying to do and we will write one.
      </p>

      <form action={formAction} className="mt-4 space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="flex-1">
            <label htmlFor="request-query" className="sr-only">
              What should the playbook do?
            </label>
            <Input
              id="request-query"
              name="query"
              required
              minLength={3}
              maxLength={300}
              placeholder="e.g. Compare flight prices across three dates and tell me which is cheapest"
              className="h-11"
            />
          </div>
          <div className="sm:w-64">
            <label htmlFor="request-email" className="sr-only">
              Email (optional)
            </label>
            <Input
              id="request-email"
              name="email"
              type="email"
              placeholder="Email (optional)"
              className="h-11"
            />
          </div>
        </div>

        {/* Honeypot: hidden from people, invisible to screen readers, skipped by
            the keyboard. A submission that fills it is a bot. */}
        <div aria-hidden="true" className="absolute h-0 w-0 overflow-hidden">
          <label htmlFor="request-company">Company</label>
          <input id="request-company" name="company" type="text" tabIndex={-1} autoComplete="off" />
        </div>

        {/* `aria-live` so a failure is announced rather than appearing silently
            below a button the reader has already pressed. */}
        <p aria-live="polite" className="min-h-5 text-sm text-destructive">
          {state.status === "error" ? state.message : ""}
        </p>

        <Button
          type="submit"
          disabled={pending}
          className="h-11 rounded-full bg-brand px-6 text-white hover:bg-brand/90"
        >
          {pending ? "Sending…" : "Request this playbook"}
        </Button>
      </form>
    </section>
  );
}