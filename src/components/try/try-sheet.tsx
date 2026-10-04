"use client";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

import { TryPanel, type TryPanelProps } from "@/components/try/try-panel";

/**
 * The try flow in a Sheet: a right-hand side panel on desktop, a full-height
 * bottom sheet on a phone.
 *
 * AGENTS.md requires mobile parity with the same copy and the same states, and
 * this is one component for both rather than two that can drift. The breakpoint
 * is `sm`, not `lg`, because the sheet's own width is what has to change — at
 * `lg` the form would sit in a narrow strip on a tablet for no reason.
 *
 * The content is the same `TryPanel` the standalone `/try` route renders, so the
 * two entry points cannot show different fields or different rules.
 */
export function TrySheet({
  open,
  onOpenChange,
  ...panel
}: TryPanelProps & { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        // Full height and full width on a phone, docked to the right from `sm`
        // up. `sm:max-w-xl` rather than a fixed width, so it scales with the
        // viewport instead of overflowing a narrow tablet.
        className="flex w-full flex-col gap-0 p-0 sm:max-w-xl [&>button]:absolute [&>button]:top-4 [&>button]:right-4 [&>button]:z-10 [&>button]:rounded-full [&>button]:p-2"
      >
        <SheetHeader className="border-b px-4 py-4 pr-14 text-left sm:px-6">
          <SheetTitle className="text-lg">Try this playbook</SheetTitle>
          {/* Described by the panel's own promise text, so a screen reader gets
              one sentence about what this is rather than an unlabelled dialog. */}
          <SheetDescription className="sr-only">
            Fill in your details, then copy the prompt to use it in your agent. Nothing you type is sent
            to us.
          </SheetDescription>
        </SheetHeader>

        <TryPanel {...panel} />
      </SheetContent>
    </Sheet>
  );
}