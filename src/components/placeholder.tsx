import type { ReactNode } from "react";

/**
 * Placeholder page body used by every route until its real implementation
 * lands. Keeps the shell consistent and gives every route a real H1 so the
 * heading order stays valid for accessibility checks.
 */
export function Placeholder({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-3 max-w-prose text-muted-foreground">{description}</p>
      {children}
      <p className="mt-8 inline-flex rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground">
        Placeholder — built in a later prompt.
      </p>
    </main>
  );
}
