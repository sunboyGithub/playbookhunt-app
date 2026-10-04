"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Flag, Search, SquarePen } from "lucide-react";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { searchPlaybooks, type PlaybookSearchHit } from "@/app/actions/search-playbooks";
import { cn } from "@/lib/utils";
import type { CategoryWithCount } from "@/server/queries/taxonomy";

/**
 * The ⌘K palette.
 *
 * Renders its own trigger button, so the header has one thing to swap in rather
 * than a button plus a context provider plus a global listener.
 *
 * Results are fetched by a server action and arrive into already-mounted state;
 * navigation uses the router rather than a link so that choosing a result does
 * not leave the dialog in the history stack.
 */
export function CommandPalette({
  categories,
  className,
}: {
  categories: Pick<CategoryWithCount, "slug" | "name" | "emoji">[];
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<PlaybookSearchHit[]>([]);

  // Results are only meaningful once there is a query to match. Deriving this
  // here means the short-query rest state needs no state update of its own.
  const hasQuery = query.trim().length >= 2;
  const shownHits = hasQuery ? hits : [];

  const go = useCallback(
    (href: string) => {
      setOpen(false);
      setQuery("");
      router.push(href);
    },
    [router],
  );

  // Debounced so typing does not fire one server action per keystroke. The
  // guard on the resolved value matters as much as the delay: without it, a slow
  // early response can land after a fast later one and overwrite it.
  //
  // There is no setState on the short-query path. Clearing results is derived
  // from `query` — see `shownHits` — rather than pushed into state, because an
  // effect that synchronously sets state to fix a value the render already knows
  // causes a second render pass to no effect.
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      return;
    }

    let current = true;
    const timer = window.setTimeout(async () => {
      const results = await searchPlaybooks(trimmed);
      if (current) {
        setHits(results);
      }
    }, 180);

    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [query]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((current) => !current);
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search playbooks"
        // The layout classes are merged, not replaced. The header passes a
        // className to resize the trigger at each breakpoint, and `??` used to
        // throw this whole string away whenever it did — taking `inline-flex`,
        // `items-center` and `gap-2` with it, which left the icon, the label and
        // the shortcut badge on an inline text baseline instead of centred in
        // the pill. `ml-auto` on the badge is a flex-only trick, so it went
        // inert at the same time.
        className={cn(
          "inline-flex h-9 items-center gap-2 rounded-full border border-border bg-card px-3.5 text-sm text-muted-foreground transition-colors hover:bg-accent",
          className,
        )}
      >
        <Search className="size-4" aria-hidden />
        {/* The mobile trigger is a square icon button, so the label and the
            shortcut badge collapse at that width rather than overflowing it. */}
        <span className="hidden lg:inline">Search playbooks</span>
        <kbd className="ml-auto hidden rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[11px] lg:inline">
          ⌘K
        </kbd>
      </button>

      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Search playbooks"
        description="Search playbooks by title, jump to a category, or start an action."
      >
        <CommandInput
          value={query}
          onValueChange={setQuery}
          placeholder="Search playbooks…"
        />
        <CommandList>
          {hasQuery && shownHits.length === 0 ? (
            <CommandEmpty>{`No playbooks match “${query.trim()}”.`}</CommandEmpty>
          ) : null}

          {shownHits.length > 0 ? (
            <CommandGroup heading="Playbooks">
              {shownHits.map((hit) => (
                <CommandItem
                  key={hit.slug}
                  value={`playbook ${hit.title}`}
                  onSelect={() => go(`/p/${hit.slug}`)}
                >
                  <FileText aria-hidden className="size-4" />
                  <span>{hit.title}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{hit.category_name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}

          {!hasQuery ? (
            <>
              <CommandGroup heading="Categories">
                {categories.map((category) => (
                  <CommandItem
                    key={category.slug}
                    value={`category ${category.name}`}
                    onSelect={() => go(`/c/${category.slug}`)}
                  >
                    <span aria-hidden>{category.emoji}</span>
                    <span>{category.name}</span>
                  </CommandItem>
                ))}
              </CommandGroup>

              <CommandSeparator />

              <CommandGroup heading="Actions">
                <CommandItem value="report a result" onSelect={() => go("/report")}>
                  <SquarePen aria-hidden className="size-4" />
                  <span>Report a result</span>
                </CommandItem>
                <CommandItem value="request a playbook" onSelect={() => go("/request")}>
                  <Flag aria-hidden className="size-4" />
                  <span>Request a playbook</span>
                </CommandItem>
              </CommandGroup>
            </>
          ) : null}
        </CommandList>
      </CommandDialog>
    </>
  );
}