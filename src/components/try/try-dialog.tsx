"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { TrySheet } from "@/components/try/try-sheet";
import type { TryPanelProps } from "@/components/try/try-panel";

/**
 * The button that opens the try sheet, and the sheet it opens.
 *
 * Kept together so any surface can offer "Try" with one component: the detail
 * page's header and sidebar buttons, and each card's hover Try. A surface that
 * wanted the sheet had to assemble six props and get the state wrong otherwise,
 * and the failure mode would be a Try button that silently does nothing.
 *
 * The trigger renders its own children, so a call site controls the shape — a
 * full-width sidebar button, a small pill on a card — while the sheet's behaviour
 * stays identical everywhere.
 */
export function TryDialog({
  children,
  panel,
}: {
  children: React.ReactNode;
  panel: Omit<TryPanelProps, "showPrivacyNote">;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid="try-open-sheet"
        className={children ? undefined : "inline-flex h-11 items-center rounded-full bg-brand px-6"}
      >
        {children ?? "Try this playbook"}
      </button>

      <TrySheet
        {...panel}
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          // Refresh on close so the page behind the sheet shows the try count and
          // the evidence that the try just produced. Without it the sheet opens
          // onto a page whose numbers are one visit stale.
          if (!next) {
            router.refresh();
          }
        }}
      />
    </>
  );
}