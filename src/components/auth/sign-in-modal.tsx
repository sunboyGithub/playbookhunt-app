"use client";

import { useState } from "react";
import { X } from "lucide-react";

import { SignInBody } from "@/components/auth/sign-in-body";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { PendingActionKind } from "@/lib/auth/pending-action";

/**
 * `<SignInModal reason="save|report|create|reminder">` — Frame 8.
 *
 * One modal for every place an account is required, with the title chosen by
 * `reason`. Four near-identical sign-in dialogs is how one of them ends up
 * promising something the others don't, and the reader who hit the wrong one
 * learns that the site's copy can't be trusted.
 *
 * Closing it cancels *only* the pending action. Nothing else is undone: the
 * reader stays where they were, at the same scroll position, on the same
 * playbook — which is what the brief asks for and the only version that isn't
 * a trap.
 */
export function SignInModal({
  reason,
  playbookId = null,
  open,
  onOpenChange,
  trigger,
  returnTo,
}: {
  reason: PendingActionKind;
  playbookId?: string | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Rendered as the trigger when `open` is not controlled. */
  trigger?: React.ReactNode;
  returnTo?: string;
}) {
  const controlled = open !== undefined;
  const [internalOpen, setInternalOpen] = useState(false);

  const isOpen = controlled ? open : internalOpen;
  const setOpen = (next: boolean) => {
    if (!controlled) setInternalOpen(next);
    onOpenChange?.(next);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}

      <DialogContent
        showCloseButton={false}
        className="w-[calc(100%-2rem)] max-w-md overflow-hidden p-0"
        data-testid="sign-in-modal"
      >
        {/* An explicit close button rather than the dialog's, so the control is
            at the top-right of the panel as the frame shows it and is not
            hidden behind the standard overlay chrome. */}
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close sign in"
          className="absolute right-3 top-3 z-10 inline-flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <X className="size-5" aria-hidden />
        </button>

        {/* Present for assistive tech and for the heading order; the visible
            title lives inside the body, which is the same markup `/login`
            renders on its own. Two competing titles in one dialog would be read
            out twice. */}
        <DialogHeader className="sr-only">
          <DialogTitle>Sign in to Playbook Hunt</DialogTitle>
          <DialogDescription>
            Sign in with Google, Facebook or an email link. Creating an account is the same step.
          </DialogDescription>
        </DialogHeader>

        <SignInBody reason={reason} playbookId={playbookId} returnTo={returnTo} />
      </DialogContent>
    </Dialog>
  );
}