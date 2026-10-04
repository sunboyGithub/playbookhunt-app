"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Star } from "lucide-react";
import { toast } from "sonner";

import { SignInModal } from "@/components/auth/sign-in-modal";
import { Button } from "@/components/ui/button";
import { toggleSave } from "@/app/actions/toggle-save";
import { rememberPendingAction } from "@/lib/auth/pending-action";

/**
 * "☆ Save" / "★ Saved".
 *
 * Signed out, it opens the sign-in panel with `reason="save"` and a pending
 * action pointing at this playbook, so a reader who signs in lands back here
 * with the star already lit. Signed in, it writes to `saves`.
 *
 * The optimistic flip is deliberate and is reverted on failure. A star that took
 * a server round-trip to appear feels broken, and one that appears and then
 * silently reverts is worse than one that waited — so the revert is announced
 * rather than just drawn.
 */
export function SaveButton({
  signedIn,
  saved: initiallySaved,
  playbookId,
}: {
  signedIn: boolean;
  /** Whether this reader has already saved it. False when signed out. */
  saved?: boolean;
  playbookId: string;
}) {
  const [saved, setSaved] = useState(initiallySaved ?? false);
  // Tracked so a change to the prop can be adopted during render rather than in
  // an effect. Setting state in an effect body is a cascading render, and the
  // React Compiler rejects it outright; this is the documented pattern for
  // "state derived from a prop that can change" and costs one extra render only
  // when the prop actually moved.
  const [lastInitial, setLastInitial] = useState(initiallySaved);
  if (initiallySaved !== lastInitial) {
    setLastInitial(initiallySaved);
    setSaved(initiallySaved ?? false);
  }

  const [busy, setBusy] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);
  const router = useRouter();

  // The server may know something the first render did not — the reader saved
  // it in another tab, or signed in elsewhere. The render-time adoption above
  // picks that up without fighting the reader's own click.

  const onClick = useCallback(async () => {
    if (!signedIn) {
      rememberPendingAction({
        action: "save",
        playbookId,
        returnTo: window.location.pathname,
        scrollY: window.scrollY,
      });
      setSignInOpen(true);
      return;
    }

    const next = !saved;
    setSaved(next);
    setBusy(true);

    const result = await toggleSave({ playbookId, saved });

    if (!result.ok) {
      setSaved(!next);
      toast.error("Couldn't save that. Try again.");
    } else {
      toast.success(next ? "Saved to My playbooks" : "Removed from My playbooks", {
        action: next
          ? { label: "View saved", onClick: () => router.push("/me") }
          : undefined,
      });
      // The evidence line and the star on other cards are both server-rendered
      // from the same save, so a refresh is what makes them agree.
      router.refresh();
    }

    setBusy(false);
  }, [playbookId, router, saved, signedIn]);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        aria-pressed={signedIn ? saved : undefined}
        onClick={() => void onClick()}
        disabled={busy}
        className={signedIn && saved ? "border-brand/40 bg-brand/5" : undefined}
        data-testid="save-button"
        data-saved={signedIn && saved ? "true" : "false"}
      >
        <Star aria-hidden className={signedIn && saved ? "fill-brand text-brand" : undefined} />
        {signedIn && saved ? "Saved" : "Save"}
      </Button>

      {!signedIn ? (
        <SignInModal
          reason="save"
          playbookId={playbookId}
          open={signInOpen}
          onOpenChange={setSignInOpen}
        />
      ) : null}
    </>
  );
}