"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { AdminEmpty } from "@/components/admin/shell";
import {
  MODERATION_NOTE_MAX,
  QUICK_REJECTION_REASONS,
  REPORT_DECISION_EFFECT,
  type ReportDecision,
} from "@/lib/admin/moderation";
import { moderateReports } from "@/server/admin/actions/moderate-reports";
import type { AdminReport } from "@/server/admin/queries/reports";

/**
 * The moderation queue.
 *
 * ## Why approve is one click and reject is two
 *
 * Approving a report restores it to the numbers; the worst case is a wrong
 * approval, which the same person can undo and which the audit log records.
 * Rejecting takes somebody's report out of a published statistic and off a page
 * they were proud of. So rejection asks for a reason, and approval does not —
 * demanding a justification for every approval produces the phrase "looks fine"
 * several hundred times, and a queue full of "looks fine" is worse than no record.
 *
 * The quick reasons are one click because the honest failure mode here is a
 * moderator typing "spam", which is a judgement on the reporter rather than on
 * the data. The field stays open for a reason none of them cover.
 *
 * ## Why the outcome never moves
 *
 * There is no control here to change `result` or the amount. A number an
 * administrator typed is a number nobody filed, and the site's claim is that the
 * statistics are what people reported — so the queue can only decide whether a
 * report counts, never what it says.
 */

export function ReportQueue({ reports }: { reports: AdminReport[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [dialog, setDialog] = useState<{ decision: ReportDecision; ids: string[] } | null>(null);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();

  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const toggle = (id: string) => {
    setSelected((current) =>
      current.includes(id) ? current.filter((row) => row !== id) : [...current, id],
    );
  };

  const allSelected = reports.length > 0 && selected.length === reports.length;

  const run = (ids: string[], decision: ReportDecision, why?: string | null) => {
    startTransition(async () => {
      const result = await moderateReports({ reportIds: ids, decision, reason: why ?? null });

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      toast.success(
        `${result.applied} report${result.applied === 1 ? "" : "s"} — ${REPORT_DECISION_EFFECT[decision]}`,
      );
      setSelected([]);
      setDialog(null);
      setReason("");
      // The queue itself, the playbook pages the reports belong to and the
      // numbers on them all changed, and the refresh behind the action already
      // recomputed the aggregates.
      router.refresh();
    });
  };

  const ask = (decision: ReportDecision, ids: string[]) => {
    if (decision === "reject") {
      setDialog({ decision, ids });
      return;
    }
    run(ids, decision);
  };

  const confirmDialog = () => {
    if (!dialog) return;
    if (dialog.decision === "reject" && reason.trim().length === 0) {
      toast.error("A rejection needs a reason. It stays private.");
      return;
    }
    run(dialog.ids, dialog.decision, reason.trim());
  };

  if (reports.length === 0) {
    return <AdminEmpty>No reports match these filters.</AdminEmpty>;
  }

  return (
    <div data-testid="report-queue">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-3">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={allSelected}
            aria-label="Select every report on this page"
            onCheckedChange={(checked) => setSelected(checked ? reports.map((r) => r.id) : [])}
          />
          <span className="text-muted-foreground">
            {selected.length > 0 ? `${selected.length} selected` : "Select all"}
          </span>
        </label>

        {selected.length > 0 ? (
          <div className="ml-auto flex flex-wrap gap-2" data-testid="report-bulk-bar">
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => run(selected, "approve")}
              data-testid="bulk-approve"
            >
              Approve {selected.length}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => ask("reject", selected)}
              data-testid="bulk-reject"
            >
              Reject {selected.length}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => run(selected, "flag_outlier")}
            >
              Flag outlier
            </Button>
          </div>
        ) : null}
      </div>

      <ul className="divide-y divide-border">
        {reports.map((report) => (
          <li
            key={report.id}
            className="px-5 py-4"
            data-testid="report-row"
            data-status={report.status}
            data-outlier={String(report.isOutlier)}
          >
            <div className="flex gap-3">
              <Checkbox
                className="mt-1"
                checked={selectedSet.has(report.id)}
                aria-label={`Select the report on ${report.playbook.title}`}
                onCheckedChange={() => toggle(report.id)}
              />

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <Outcome result={report.result} />
                  {report.amount !== null ? (
                    <span className="text-sm tabular-nums">
                      {report.amount}
                      {report.unit ? ` ${report.unit}` : ""}
                    </span>
                  ) : null}
                  {report.hoursSaved !== null ? (
                    <span className="text-sm tabular-nums">{report.hoursSaved} hours</span>
                  ) : null}

                  <Link
                    href={`/p/${report.playbook.slug}`}
                    className="text-sm font-medium hover:underline"
                  >
                    {report.playbook.title}
                  </Link>

                  {report.status !== "approved" ? (
                    <Tag>{report.status}</Tag>
                  ) : null}
                  {report.isOutlier ? <Tag tone="partly">outlier</Tag> : null}
                  {report.isVerified ? <Tag tone="worked">verified</Tag> : null}
                  {report.evidence.length > 0 ? (
                    <Tag tone={report.evidenceReviewed ? "worked" : "partly"}>
                      evidence {report.evidenceReviewed ? "reviewed" : "pending"}
                    </Tag>
                  ) : null}
                </div>

                {report.note ? (
                  <p className="mt-1 text-sm text-muted-foreground">{report.note}</p>
                ) : null}

                <p className="mt-1 text-xs text-muted-foreground">
                  {report.reporter.name ?? "No display name"} ·{" "}
                  {report.reporter.email || "address not resolved"} ·{" "}
                  {new Date(report.createdAt).toLocaleString()}
                </p>

                {report.moderationNote ? (
                  <p className="mt-2 rounded-lg bg-muted px-3 py-2 text-xs">
                    <span className="font-medium">Moderator note:</span> {report.moderationNote}
                  </p>
                ) : null}
              </div>

              <div className="flex shrink-0 flex-wrap gap-1.5 self-start">
                {report.status !== "approved" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() => run([report.id], "approve")}
                    data-testid="report-approve"
                  >
                    Approve
                  </Button>
                ) : null}

                {report.status !== "rejected" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() => ask("reject", [report.id])}
                    data-testid="report-reject"
                  >
                    Reject
                  </Button>
                ) : null}

                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() =>
                    run([report.id], report.isOutlier ? "unflag_outlier" : "flag_outlier")
                  }
                >
                  {report.isOutlier ? "Unflag" : "Flag outlier"}
                </Button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {pending ? (
        <p className="flex items-center gap-2 border-t border-border px-5 py-3 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Saving, and recomputing the numbers this touches&hellip;
        </p>
      ) : null}

      <Dialog open={dialog !== null} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Reject {dialog?.ids.length === 1 ? "this report" : `${dialog?.ids.length} reports`}?
            </DialogTitle>
            <DialogDescription>
              {dialog?.ids.length === 1 ? "It stops" : "They stop"} counting towards the published
              numbers and {dialog?.ids.length === 1 ? "disappears" : "disappear"} from the public page.
              The reporter sees nothing but that it is not counted.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap gap-2">
            {QUICK_REJECTION_REASONS.map((quick) => (
              <button
                key={quick}
                type="button"
                onClick={() => setReason(quick)}
                className="rounded-lg border border-border px-3 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground"
              >
                {quick}
              </button>
            ))}
          </div>

          <label className="block">
            <span className="text-sm font-medium">Why (private)</span>
            <Textarea
              className="mt-1 min-h-24"
              value={reason}
              maxLength={MODERATION_NOTE_MAX}
              placeholder="A sentence is enough."
              onChange={(event) => setReason(event.target.value)}
              data-testid="reject-reason"
            />
          </label>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)} disabled={pending}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDialog} disabled={pending} data-testid="reject-confirm">
              Reject {dialog?.ids.length ?? 0}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const RESULT_TONE: Record<string, string> = {
  worked: "text-worked",
  partly: "text-partly",
  didnt: "text-didnt",
};

function Outcome({ result }: { result: string }) {
  return (
    <span className={`text-sm font-medium capitalize ${RESULT_TONE[result] ?? ""}`}>{result}</span>
  );
}

function Tag({ children, tone = "default" }: { children: React.ReactNode; tone?: "default" | "worked" | "partly" }) {
  const toneClass =
    tone === "worked" ? "bg-tint-mint text-worked" : tone === "partly" ? "bg-tint-peach text-partly" : "bg-muted text-muted-foreground";

  return <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${toneClass}`}>{children}</span>;
}