import { AdminPage, Panel, FilterTabs, Stat } from "@/components/admin/shell";
import { SubmissionQueue } from "@/components/admin/submission-queue";
import {
  countSubmissionsByStatus,
  listSubmissions,
} from "@/server/admin/queries/submissions";
import { requireAdmin } from "@/server/admin/session";

/**
 * The review queue.
 *
 * ## Counts are submissions, not playbooks
 *
 * The same shape as the requests inbox, for the same reason: "14" beside
 * "With a reviewer" means fourteen people waiting, not fourteen lines. Here it
 * happens to be one-to-one — a playbook has at most one submission row — but the
 * query counts the submissions rather than the playbooks so the number stays
 * right if that ever changes.
 *
 * ## Approved is a tab, not a row
 *
 * An approved submission is on the site and its review is finished, so it leaves
 * the working list. It stays reachable because "why is this published and that one
 * isn't" is a question this page has to answer without leaving it.
 */

const FILTERS = ["queue", "in_review", "changes_requested", "approved", "rejected"] as const;

type Filter = (typeof FILTERS)[number];

export default async function AdminSubmissionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireAdmin();
  const params = await searchParams;

  const requested = Array.isArray(params.status) ? params.status[0] : params.status;
  const status = (FILTERS.find((option) => option === requested) ?? "queue") as Filter;

  const [items, counts] = await Promise.all([
    listSubmissions(session.client, status),
    countSubmissionsByStatus(session.client).catch(() => ({} as Record<string, number>)),
  ]);

  const inReview = counts.in_review ?? 0;
  const changes = counts.changes_requested ?? 0;
  const approved = counts.approved ?? 0;
  const total = inReview + changes;

  return (
    <AdminPage
      title="Submissions"
      description="What creators wrote on /create. Approving publishes; nothing here affects how anything is ranked."
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Waiting" value={total} tone={total > 0 ? "worked" : "default"} />
        <Stat label="In review" value={inReview} />
        <Stat label="Changes asked for" value={changes} />
        <Stat label="Approved" value={approved} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <FilterTabs
          base="/admin/submissions"
          active={status}
          options={[
            { value: "queue", label: "Queue", count: total },
            { value: "in_review", label: "In review", count: inReview },
            { value: "changes_requested", label: "Changes asked", count: changes },
            { value: "approved", label: "Approved", count: approved },
            { value: "rejected", label: "Rejected", count: counts.rejected ?? 0 },
          ]}
        />
      </div>

      <div className="mt-4">
        <Panel>
          <SubmissionQueue items={items} />
        </Panel>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        A creator&rsquo;s own &ldquo;what result did you get&rdquo; is shown above for context and is
        never counted as a report, a statistic, or site verification.
      </p>
    </AdminPage>
  );
}