import { BadgeCheck, Clock } from "lucide-react";

import { formatMoney, formatRelativeDate } from "@/lib/stats/format";
import { formatTimeSpent, type ReportRow } from "@/server/queries/reports";

/**
 * Recent approved reports.
 *
 * Three things are deliberately absent, and each is a rule rather than an
 * omission:
 *
 * - **No evidence thumbnails.** `report_evidence` has no public select policy
 *   and v1 never renders evidence publicly. A report the moderator checked
 *   carries an "Evidence reviewed" tag instead, which is the honest version of
 *   the same reassurance.
 * - **No reporter's email or handle.** The view already substitutes a display
 *   name and an initial; nothing here reaches past them.
 * - **No notes at all.** Not quoted, not truncated, not rendered. A note is
 *   free text typed by a stranger, it is the one field with no length or content
 *   limit on it, and it is the one field a reader cannot act on — the result,
 *   the amount and the date are what the list is for. Notes are read in `/admin`
 *   and written nowhere public. This was previously documented as "shown as
 *   plain text, never as HTML", which described an intention the component has
 *   never implemented; the code is the honest version.
 */
export function ReportList({
  reports,
  now,
  emptyMessage,
}: {
  reports: ReportRow[];
  now: number;
  emptyMessage: string;
}) {
  if (reports.length === 0) {
    return (
      <p className="mt-4 rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        {emptyMessage}
      </p>
    );
  }

  return (
    <ul className="mt-4 divide-y divide-border rounded-xl border border-border bg-card">
      {reports.map((report) => (
        <li key={report.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              report.result === "worked"
                ? "bg-verified-bg text-foreground"
                : report.result === "partly"
                  ? "bg-tint-peach text-foreground"
                  : "bg-muted text-muted-foreground"
            }`}
          >
            {RESULT_LABELS[report.result]}
          </span>

          <span className="font-medium tabular-nums">{describeAmount(report)}</span>

          {report.agent_name ? (
            <span className="text-sm text-muted-foreground">{report.agent_name}</span>
          ) : null}

          {report.is_verified ? (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <BadgeCheck aria-hidden className="size-3.5" />
              Verified
            </span>
          ) : null}

          {report.evidence_reviewed ? (
            <span
              className="rounded-full bg-tint-lavender px-2 py-0.5 text-xs text-foreground"
              data-testid="evidence-reviewed"
            >
              Evidence reviewed
            </span>
          ) : null}

          <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
            {formatTimeSpent(report.time_spent_bucket) ? (
              <>
                <Clock aria-hidden className="size-3.5" />
                {formatTimeSpent(report.time_spent_bucket)}
              </>
            ) : null}
            {formatRelativeDate(report.created_at, now)}
          </span>
        </li>
      ))}
    </ul>
  );
}

const RESULT_LABELS: Record<ReportRow["result"], string> = {
  worked: "Worked",
  partly: "Partly worked",
  didnt: "Didn't work",
};

/**
 * What one report saved, from what it actually carries.
 *
 * This is one person's result, not an aggregate, so none of the report
 * thresholds apply and there is nothing to compute. When a reporter left the
 * amount blank the row shows the result and no figure — not a zero, which would
 * read as "this saved nothing".
 */
function describeAmount(report: ReportRow): string {
  if (report.amount !== null && report.amount !== undefined) {
    return `${formatMoney(report.amount)}${report.unit ?? ""}`;
  }
  if (report.hours_saved !== null && report.hours_saved !== undefined) {
    const hours = Math.round(Number(report.hours_saved));
    return `${hours} ${hours === 1 ? "hr" : "hrs"} saved`;
  }
  return "Result recorded";
}