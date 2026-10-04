"use client";

import { useState } from "react";
import Link from "next/link";
import { Star } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * "☆ Save" / "★ Saved".
 *
 * Auth arrives in P8, so this is deliberately half-built and I want to be
 * explicit about which half. The *control* is complete: it renders both states,
 * it is reachable from the keyboard, and when there is no session it opens the
 * sign-in dialog with the title the brief specifies. What it does not do is
 * pretend to save.
 *
 * The alternative — flipping to "★ Saved" and firing a toast, with nothing
 * persisted — would pass a screenshot and fail on reload. A reader who closes
 * their laptop has lost the thing they were told they'd kept, and a save list
 * that forgets is worse than no save list at all because it lied about being
 * one. So the button says what is true: sign in, and it will save.
 *
 * `SaveToggle` below is the seam P8 fills: once `getSession()` returns a user,
 * the same button writes to `saves` and the dialog becomes unreachable.
 */
export function SaveButton({ signedIn }: { signedIn: boolean }) {
  const [dialogOpen, setDialogOpen] = useState(false);

  // Unreachable until P8 supplies a session. Kept as an explicit early return
  // rather than a comment, so it cannot be mistaken for working behaviour.
  if (!signedIn) {
    return (
      <>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setDialogOpen(true)}
          data-testid="save-button"
        >
          <Star aria-hidden />
          Save
        </Button>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              {/* Exact title from the brief. A sign-in dialog whose heading is
                  "Welcome back" does not tell the reader why they are being
                  asked to sign in at all. */}
              <DialogTitle>Sign in to save this playbook</DialogTitle>
              <DialogDescription>
                Saved playbooks live in My playbooks, so you can come back to them on any device.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button asChild className="rounded-full">
                <Link href="/login?next=/p">Sign in</Link>
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return <SaveToggle />;
}

/** The signed-in state. Wired in P8 alongside the session. */
function SaveToggle() {
  return (
    <Button variant="outline" size="sm" aria-pressed={false} data-testid="save-button">
      <Star aria-hidden />
      Save
    </Button>
  );
}