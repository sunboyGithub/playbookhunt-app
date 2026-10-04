"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useTransition } from "react";

/**
 * Provider / Agent / Result chips above the report list.
 *
 * Filters live in the URL, not in component state, for the same reason the
 * search page's do: a filtered report list that cannot be linked or shared is a
 * different page from the one everyone else sees, and "here are the reports
 * where it did *not* work" is exactly the link someone wants to send.
 *
 * Native `<select>` rather than a custom popover. Three options each does not
 * justify a popover, and the native control comes with keyboard behaviour,
 * a screen-reader announcement and a mobile picker that are all already correct.
 *
 * `replace` rather than `push`, so filtering six times does not bury the page
 * under six history entries the reader has to press Back through.
 */
export function ReportFilters({
  providers,
  agentOptions,
}: {
  providers: string[];
  agentOptions: { slug: string; name: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const setFilter = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(params.toString());
      if (value) {
        next.set(key, value);
      } else {
        next.delete(key);
      }
      const query = next.toString();
      startTransition(() => {
        router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
      });
    },
    [params, pathname, router],
  );

  const value = (key: string) => params.get(key) ?? "";

  return (
    <div
      className={`mt-4 flex flex-wrap items-center gap-2 ${pending ? "opacity-60" : ""}`}
      aria-busy={pending}
    >
      <span className="text-sm text-muted-foreground">Filter:</span>

      <select
        value={value("provider")}
        onChange={(event) => setFilter("provider", event.target.value)}
        aria-label="Filter reports by provider"
        data-testid="filter-provider"
        className="h-8 rounded-full border border-border bg-background px-3 text-sm"
      >
        <option value="">All providers</option>
        {providers.map((provider) => (
          <option key={provider} value={provider}>
            {provider}
          </option>
        ))}
      </select>

      <select
        value={value("agent")}
        onChange={(event) => setFilter("agent", event.target.value)}
        aria-label="Filter reports by agent"
        data-testid="filter-agent"
        className="h-8 rounded-full border border-border bg-background px-3 text-sm"
      >
        <option value="">All agents</option>
        {agentOptions.map((agent) => (
          <option key={agent.slug} value={agent.slug}>
            {agent.name}
          </option>
        ))}
      </select>

      <select
        value={value("result")}
        onChange={(event) => setFilter("result", event.target.value)}
        aria-label="Filter reports by result"
        data-testid="filter-result"
        className="h-8 rounded-full border border-border bg-background px-3 text-sm"
      >
        <option value="">All results</option>
        <option value="worked">Worked</option>
        <option value="partly">Partly worked</option>
        <option value="didnt">Didn&apos;t work</option>
      </select>
    </div>
  );
}