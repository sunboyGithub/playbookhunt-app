"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SEARCH_PLACEHOLDERS } from "@/lib/site-config";

/**
 * The hero search field, with a placeholder that rotates.
 *
 * Rotating only ever changes the `placeholder` attribute, never the input's
 * value, so nothing a reader has typed is disturbed and nothing is submitted
 * that they did not type.
 *
 * Reduced motion is honoured by not starting the rotation at all, rather than by
 * animating faster: a placeholder that changes on its own is exactly the kind of
 * movement the preference exists to suppress.
 */
export function SearchField({ className }: { className?: string }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      return;
    }

    // No fade on the swap: a `placeholder` is an attribute, and an attribute
    // cannot be transitioned. Animating a wrapper instead would fade the
    // placeholder in while the caret sat in the middle of it.
    const advance = window.setInterval(
      () => setIndex((current) => (current + 1) % SEARCH_PLACEHOLDERS.length),
      3200,
    );

    return () => window.clearInterval(advance);
  }, []);

  return (
    <form
      action="/search"
      role="search"
      className={`flex w-full items-center gap-2 rounded-full border border-border bg-card p-1.5 pl-5 shadow-sm focus-within:ring-2 focus-within:ring-ring ${className ?? ""}`}
    >
      <Search aria-hidden className="size-5 shrink-0 text-muted-foreground" />
      <input
        type="search"
        name="q"
        aria-label="Search playbooks"
        placeholder={SEARCH_PLACEHOLDERS[index]}
        className="h-11 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
      />
      <Button type="submit" className="h-11 rounded-full bg-brand px-6 text-white hover:bg-brand/90">
        Search
      </Button>
      {/* Announced politely so the rotation is not a surprise for screen reader
          users, who would otherwise hear it change with no explanation. */}
      <span aria-live="polite" className="sr-only">
        {SEARCH_PLACEHOLDERS[index]}
      </span>
    </form>
  );
}