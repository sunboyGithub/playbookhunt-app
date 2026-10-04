"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { SignInModal } from "@/components/auth/sign-in-modal";
import { ReportForm, type ReportFormProps } from "@/components/report/report-form";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * "Report a result" from the detail page.
 *
 * Two panels behind one trigger, chosen by whether there is a session. Signing
 * in replaces the report form in place rather than sending the reader away and
 * back, so the pending action they were mid-way through is still the one they
 * come back to.
 *
 * A dialog rather than a page because the reader is on the playbook and usually
 * wants to end up back on it — and `/p/[slug]/report` exists for the case where
 * they would rather have a URL: a follow-up email, a refresh, a second tab.
 */
export function ReportDialog({
  signedIn,
  trigger,
  ...form
}: ReportFormProps & { signedIn: boolean; trigger?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  if (!signedIn) {
    return (
      <SignInModal
        reason="report"
        playbookId={form.playbookId}
        returnTo={`/p/${form.playbookSlug}/report`}
        trigger={trigger}
      />
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}

      <DialogContent
        className="max-h-[90vh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto"
        data-testid="report-dialog"
      >
        <DialogHeader>
          <DialogTitle>Did it work for you?</DialogTitle>
          <DialogDescription>
            Takes about 30 seconds. Your report is how the next person finds out.
          </DialogDescription>
        </DialogHeader>

        <div className="pt-1">
          <ReportForm
            {...form}
            onSubmitted={() => {
              // The report list under the dialog gains a row, and the evidence
              // tiles may change. Without this the page behind is one submit
              // stale and looks like the report went nowhere. The dialog stays
              // open: the confirmation is inside it.
              router.refresh();
            }}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}