"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { markPlaybookVerified } from "@/server/admin/actions/playbooks";

/**
 * "Mark verified now" — the founder saying they ran it themselves.
 *
 * A button and not a date field on purpose: the claim being made is "I know this
 * is true, as of now", and the only date a person can honestly supply for that is
 * the current one. A date input would invite a backdated verification, which is
 * the exact shape of a lie the site's whole premise is built to avoid.
 *
 * Confirming is one extra click. It rewrites a fact readers act on — the "last
 * verified" line on the public page — and unlike the evidence queue there is no
 * file behind this one to check it against, so the only safeguard is that nobody
 * presses it by accident.
 */

export function VerifyButton({ playbookId, lastVerifiedAt }: { playbookId: string; lastVerifiedAt: string | null }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  const mark = () => {
    startTransition(async () => {
      const result = await markPlaybookVerified({ playbookId });

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      setConfirming(false);
      toast.success("Marked verified as of now.");
      router.refresh();
    });
  };

  if (confirming) {
    return (
      <span className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={mark} disabled={pending} data-testid="verify-confirm">
          Yes — I ran this
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setConfirming(false)} disabled={pending}>
          Cancel
        </Button>
        <span className="text-xs text-muted-foreground">
          This sets the date to now. It does not check anything.
        </span>
      </span>
    );
  }

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={() => setConfirming(true)}
      disabled={pending}
      data-testid="verify-now"
    >
      <ShieldCheck className="size-4" aria-hidden />
      {lastVerifiedAt ? "Mark verified again" : "Mark verified now"}
    </Button>
  );
}