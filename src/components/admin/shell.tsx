import Link from "next/link";
import type { ReactNode } from "react";

/**
 * The furniture every /admin page sits in.
 *
 * Server components with no directive, because none of them hold state — the
 * interactive parts are the buttons and forms, which are client components in
 * their own files. Keeping this file free of `"use client"` is what lets a page
 * render its heading and its counts on the server and only ship the parts that
 * actually need to be interactive.
 *
 * The look is the public site's: same background, same card, same border, same
 * radius. An admin area that looks like a different product tends to grow
 * features that read as unfinished, because it never has to answer to anything.
 */

/** The page heading block. `actions` sits right of it on desktop, below on mobile. */
export function AdminPage({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main data-testid="admin-page">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {description ? (
            <p className="mt-1 max-w-prose text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
      </div>

      <div className="mt-6">{children}</div>
    </main>
  );
}

/** A white panel. The unit the whole admin area is built from. */
export function Panel({
  title,
  description,
  actions,
  children,
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card">
      {title ? (
        <header className="flex flex-col gap-2 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold">{title}</h2>
            {description ? (
              <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
            ) : null}
          </div>
          {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
        </header>
      ) : null}
      <div className="p-5">{children}</div>
    </section>
  );
}

/**
 * One of the dashboard's numbers.
 *
 * A queue count is a link to the queue, because a count you cannot act on is a
 * number to look at. `href` is therefore not optional in practice even though it
 * is optional in the type — the dashboard passes one for all six.
 */
export function Stat({
  label,
  value,
  href,
  hint,
  tone = "default",
}: {
  label: string;
  value: number;
  href?: string;
  hint?: string;
  tone?: "default" | "worked";
}) {
  const body = (
    <>
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span
        className={`mt-1 block text-2xl font-semibold tabular-nums ${tone === "worked" ? "text-worked" : ""}`}
      >
        {value}
      </span>
      {hint ? <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span> : null}
    </>
  );

  const className = "block rounded-xl border border-border bg-card p-4";

  return href ? (
    <Link href={href} className={`${className} transition-colors hover:border-foreground/20`}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

/**
 * Filters as links, not as a client-side tab widget.
 *
 * The same decision /me made and the same reason: a moderator who filters the
 * queue down to "outliers on this playbook" and copies the URL has to send
 * somebody a link that shows exactly that. It also means the browser's back
 * button undoes a filter, which is what everybody expects it to do.
 */
export function FilterTabs({
  base,
  options,
  active,
  param = "status",
}: {
  base: string;
  options: { value: string; label: string; count?: number }[];
  active: string;
  param?: string;
}) {
  return (
    <nav className="flex flex-wrap gap-2" aria-label="Filters">
      {options.map((option) => {
        const isActive = option.value === active;
        const href = option.value === "any" ? base : `${base}?${param}=${option.value}`;

        return (
          <Link
            key={option.value}
            href={href}
            aria-current={isActive ? "page" : undefined}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors ${
              isActive
                ? "border-foreground/20 bg-foreground text-background"
                : "border-border bg-card text-muted-foreground hover:border-foreground/20"
            }`}
          >
            {option.label}
            {option.count === undefined ? null : (
              <span className={isActive ? "text-background/70" : "text-muted-foreground/70"}>
                {option.count}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

/** What a queue shows when it is empty. Never a bare "no results". */
export function AdminEmpty({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-border px-5 py-10 text-center text-sm text-muted-foreground">
      {children}
    </p>
  );
}

/** A label/value pair in a definition list, for the detail panels. */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm break-words">{children}</dd>
    </div>
  );
}