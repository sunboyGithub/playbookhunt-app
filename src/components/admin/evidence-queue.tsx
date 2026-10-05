"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import Link from "next/link";
import { ExternalLink, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AdminEmpty } from "@/components/admin/shell";
import { EVIDENCE_URL_TTL_SECONDS } from "@/lib/admin/moderation";
import { previewEvidence, reviewEvidence } from "@/server/admin/actions/review-evidence";
import type { EvidenceItem } from "@/server/admin/queries/evidence";

/**
 * The evidence queue: one attached file, one decision.
 *
 * ## Why the file opens in a new tab rather than inline
 *
 * The files are screenshots, PDFs and terminal captures of unknown dimensions, and
 * an inline viewer has to guess. Opening the real file in a new tab shows what
 * the reporter actually uploaded, at its own size, which is the thing being
 * judged.
 *
 * ## Why the link is fetched, not rendered
 *
 * `previewEvidence` returns a link good for five minutes. Rendering it in the
 * markup would put a bearer URL for a private upload into the HTML of a page —
 * and the page would keep serving it after it expired, telling the next moderator
 * it was broken. Fetching on click means the link is as fresh as the click and
 * never sits in a cached document.
 *
 * ## Why the reason is per-row and optional on approve
 *
 * Same rule as the reports queue: rejection is the one that removes something,
 * so it is the one that says why. The panel expands under the row it belongs to,
 * because a dialog over a list of fifty files is a dialog you have to re-aim
 * every time.
 */

export function EvidenceQueue({ items }: { items: EvidenceItem[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [opening, setOpening] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const open = (evidenceId: string) => {
    setOpening(evidenceId);
    startTransition(async () => {
      const result = await previewEvidence({ evidenceId });

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      window.open(result.url, "_blank", "noopener,noreferrer");
      toast.info(`The link is good for ${EVIDENCE_URL_TTL_SECONDS / 60} minutes.`);
    });
    // `startTransition` has no completion callback in React 19, so the flag is
    // cleared by the next render rather than awaited. Harmless: the worst case is
    // a spinner that stops one render late.
    setOpening(null);
  };

  const decide = (evidenceId: string, decision: "approve" | "reject", why?: string) => {
    startTransition(async () => {
      const result = await reviewEvidence({ evidenceId, decision, reason: why ?? null });

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      toast.success(
        decision === "approve"
          ? "Accepted. The report is now shown as verified."
          : "Rejected. The report keeps whatever other evidence it has.",
      );
      setRejecting(null);
      setReason("");
      router.refresh();
    });
  };

  if (items.length === 0) {
    return (
      <AdminEmpty>
        Nothing waiting. A file lands here the moment somebody attaches one to a report — the
        uploader can see it and so can you, and nobody else.
      </AdminEmpty>
    );
  }

  return (
    <ul className="divide-y divide-border" data-testid="evidence-queue">
      {items.map((item) => (
        <li key={item.id} className="px-5 py-4" data-testid="evidence-row">
          <div className="flex flex-wrap items-start gap-3">
            <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />

            <div className="min-w-0 flex-1">
              <p className="text-sm">
                <span className="font-medium capitalize">{item.kind}</span>
                {item.report.amount !== null ? (
                  <>
                    {" — "}
                    <span className="tabular-nums">
                      {item.report.amount}
                      {item.report.unit ? ` ${item.report.unit}` : ""}
                    </span>
                  </>
                ) : (
                  " — no amount"
                )}
                {" on "}
                <Link href={`/p/${item.playbook.slug}`} className="font-medium hover:underline">
                  {item.playbook.title}
                </Link>
              </p>

              {item.report.note ? (
                <p className="mt-1 text-sm text-muted-foreground">&ldquo;{item.report.note}&rdquo;</p>
              ) : null}

              <p className="mt-1 text-xs text-muted-foreground">
                {item.report.reporterName ?? "No display name"} ·{" "}
                {new Date(item.createdAt).toLocaleString()} ·{" "}
                {item.reviewStatus === "pending" ? "not looked at yet" : item.reviewStatus}
              </p>

              {item.reviewNote ? (
                <p className="mt-2 rounded-lg bg-muted px-3 py-2 text-xs">
                  <span className="font-medium">Reviewer note:</span> {item.reviewNote}
                </p>
              ) : null}
            </div>

            <div className="flex shrink-0 flex-wrap gap-1.5">
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => open(item.id)}
                data-testid="evidence-open"
              >
                {opening === item.id ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <ExternalLink className="size-4" aria-hidden />
                )}
                Open file
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => decide(item.id, "approve")}
                data-testid="evidence-approve"
              >
                Accept
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => {
                  setRejecting(rejecting === item.id ? null : item.id);
                  setReason("");
                }}
              >
                Reject
              </Button>
            </div>
          </div>

          {rejecting === item.id ? (
            <div className="mt-3 rounded-xl bg-muted p-3">
              <label className="block">
                <span className="text-sm font-medium">Why (private)</span>
                <Textarea
                  className="mt-1 min-h-20 bg-card"
                  value={reason}
                  placeholder="What is wrong with this file?"
                  onChange={(event) => setReason(event.target.value)}
                  data-testid="evidence-reason"
                />
              </label>
              <div className="mt-2 flex gap-2">
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={pending || reason.trim().length === 0}
                  onClick={() => decide(item.id, "reject", reason.trim())}
                  data-testid="evidence-reject-confirm"
                >
                  Reject this file
                </Button>
                <Button size="sm" variant="outline" onClick={() => setRejecting(null)} disabled={pending}>
                  Cancel
                </Button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Rejecting this file does not reject the report. The report keeps counting; it just
                loses this one piece of support, and if it had no other, the verified tag comes off.
              </p>
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
