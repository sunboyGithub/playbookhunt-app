"use client";

import { SlidersHorizontal } from "lucide-react";
import { useState } from "react";

import { FilterPanel } from "@/components/search/filter-panel";
import { useResultsParams } from "@/components/search/use-results-params";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { activeFilterCount } from "@/lib/search/params";

/**
 * The mobile form of the filter sidebar: the same `FilterPanel`, in a bottom
 * sheet, behind one button.
 *
 * Below `lg` the sidebar is hidden, so this is the only way to reach the facets
 * on a phone. It reuses the panel component rather than restating it, which is
 * what keeps mobile parity structural rather than a matter of discipline.
 *
 * The sheet closes on change, because on a phone it covers the results the
 * reader is filtering — leaving it open means every facet tap hides the very
 * thing they are trying to narrow down.
 */
export function MobileFilters(props: Parameters<typeof FilterPanel>[0]) {
  const { params } = useResultsParams();
  const [open, setOpen] = useState(false);
  const count = activeFilterCount(params);

  return (
    // `onOpenChange` fires for *both* transitions. Handling only the closing one
    // left `open` permanently false, so tapping Filters did nothing at all — the
    // sheet could not be opened on a phone by anyone, and no desktop test could
    // catch it because the sidebar is a different element entirely.
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          className="h-9 rounded-full lg:hidden"
          aria-label={count > 0 ? `Filters, ${count} active` : "Filters"}
        >
          <SlidersHorizontal aria-hidden className="size-4" />
          Filters
          {count > 0 ? (
            <span className="ml-1 rounded-full bg-foreground px-1.5 text-xs text-background">
              {count}
            </span>
          ) : null}
        </Button>
      </SheetTrigger>

      <SheetContent
        side="bottom"
        className="max-h-[85vh] overflow-y-auto rounded-t-2xl p-0"
      >
        <SheetHeader className="border-b border-border p-4">
          <SheetTitle>Filters</SheetTitle>
        </SheetHeader>

        <div className="p-4">
          <FilterPanel {...props} onChange={() => setOpen(false)} />
        </div>
      </SheetContent>
    </Sheet>
  );
}