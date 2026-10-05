import Link from "next/link";

import { AdminPage, Panel, FilterTabs, Stat } from "@/components/admin/shell";
import { ReportQueue } from "@/components/admin/report-queue";
import {
  EVIDENCE_FILTERS,
  REPORT_STATUSES,
  listReports,
  type EvidenceFilter,
  type ReportStatus,
} from "@/server/admin/queries/reports";
import { listPlaybookOptions } from "@/server/admin/queries/playbooks";
import { requireAdmin } from "@/server/admin/session";

/**
 * The reports queue.
 *
 * Filters are the query string, not component state, for the same reason
 * `FilterTabs` is links: a moderator who narrows this to the outliers on one
 * playbook has to be able to send somebody that exact view, and the back button
 * has to undo a filter rather than leave the page.
 *
 * The `playbook` filter is a form rather than a link because there are dozens of
 * playbooks and four of them are relevant. It is the one filter with too many
 * values to click through, so it submits — to the same URL the links use, which
 * is why the two are interchangeable.
 *
 * Nothing here writes. Every button on this page is a server action guarded by
 * the same `requireAdmin()` as the layout, and the page's own gate is what makes
 * a non-administrator's bookmark resolve to a 404 rather than a queue.
 */

type Search = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function status(value: string | undefined): ReportStatus | undefined {
  return REPORT_STATUSES.find((option) => option === value);
}

function evidence(value: string | undefined): EvidenceFilter {
  return EVIDENCE_FILTERS.find((option) => option === value) ?? "any";
}

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const session = await requireAdmin();
  const params = await searchParams;

  const filters = {
    status: status(first(params.status)),
    outlier: first(params.outlier) === "1",
    evidence: evidence(first(params.evidence)),
    playbookId: first(params.playbook),
  };

  const [{ reports, total }, playbooks] = await Promise.all([
    listReports(session.client, filters),
    listPlaybookOptions(session.client),
  ]);

  // Counts for the status tabs, each ignoring the status tab itself so the tabs
  // answer "how many of these are there" rather than "how many of the thing I am
  // already looking at".
  const [pending, approved, rejected] = await Promise.all([
    listReports(session.client, { ...filters, status: "pending" }),
    listReports(session.client, { ...filters, status: "approved" }),
    listReports(session.client, { ...filters, status: "rejected" }),
  ]);

  const carrying = (current: string) => {
    const query = new URLSearchParams();
    if (filters.outlier) query.set("outlier", "1");
    if (filters.evidence !== "any") query.set("evidence", filters.evidence);
    if (filters.playbookId) query.set("playbook", filters.playbookId);
    if (current !== "any") query.set("status", current);
    const search = query.toString();
    return search === "" ? "/admin/reports" : `/admin/reports?${search}`;
  };

  const activeStatus = filters.status ?? "any";
  const activeEvidence = filters.evidence;

  return (
    <AdminPage
      title="Reports"
      description="Every outcome somebody filed. Approving puts it back in the numbers; rejecting takes it out and keeps the reason private."
      actions={
        <Link
          href="/admin/evidence"
          className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-foreground/20"
        >
          Evidence queue
        </Link>
      }
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Matching" value={total} hint="With the filters below" />
        <Stat label="Pending" value={pending.total} />
        <Stat label="Approved" value={approved.total} />
        <Stat label="Rejected" value={rejected.total} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <FilterTabs
          base="/admin/reports"
          active={activeStatus}
          options={[
            { value: "any", label: "All", count: total },
            { value: "pending", label: "Pending", count: pending.total },
            { value: "approved", label: "Approved", count: approved.total },
            { value: "rejected", label: "Rejected", count: rejected.total },
          ]}
        />

        <form action="/admin/reports" className="flex flex-wrap items-center gap-2">
          {/* The status tab is part of the form's own state, so submitting the
              playbook picker does not silently reset the queue back to All. */}
          {filters.status ? <input type="hidden" name="status" value={filters.status} /> : null}
          {filters.outlier ? <input type="hidden" name="outlier" value="1" /> : null}
          {filters.evidence !== "any" ? (
            <input type="hidden" name="evidence" value={filters.evidence} />
          ) : null}

          <select
            name="evidence"
            defaultValue={activeEvidence}
            aria-label="Evidence"
            className="rounded-lg border border-border bg-card px-2 py-1.5 text-sm"
          >
            <option value="any">Any evidence</option>
            <option value="pending">Evidence to review</option>
            <option value="reviewed">Evidence reviewed</option>
          </select>

          <select
            name="playbook"
            defaultValue={filters.playbookId ?? ""}
            aria-label="Playbook"
            className="max-w-56 rounded-lg border border-border bg-card px-2 py-1.5 text-sm"
          >
            <option value="">Every playbook</option>
            {playbooks.map((playbook) => (
              <option key={playbook.id} value={playbook.id}>
                {playbook.title}
                {playbook.status === "published" ? "" : ` (${playbook.status})`}
              </option>
            ))}
          </select>

          <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <input
              type="checkbox"
              name="outlier"
              value="1"
              defaultChecked={filters.outlier}
              className="size-4 rounded border-border"
            />
            Outliers only
          </label>

          <button
            type="submit"
            className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-foreground/20"
          >
            Apply
          </button>
        </form>
      </div>

      {filters.outlier || activeEvidence !== "any" || filters.playbookId ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Filtered.{" "}
          <Link className="underline" href={carrying("any")}>
            Clear the extra filters
          </Link>
          .
        </p>
      ) : null}

      <div className="mt-4">
        <Panel>
          <ReportQueue reports={reports} />
        </Panel>
      </div>

      {total > reports.length ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Showing the newest {reports.length} of {total}. Narrow it with the filters above — this
          page does not paginate, because a queue that silently showed the first hundred would be
          mistaken for a queue that had been cleared.
        </p>
      ) : null}
    </AdminPage>
  );
}
