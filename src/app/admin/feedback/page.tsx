import { AdminPage, Panel, FilterTabs, Stat } from "@/components/admin/shell";
import { FeedbackQueue } from "@/components/admin/feedback-queue";
import {
  FEEDBACK_STATUSES,
  countFeedbackByStatus,
  listFeedback,
} from "@/server/admin/queries/feedback";
import { requireAdmin } from "@/server/admin/session";

/**
 * The feedback queue.
 *
 * Smallest page in the admin area and the only one with no consequences attached
 * to it — which is stated here because "admin queue" usually means the opposite,
 * and a reader of this code should not have to work out that this one is inert.
 *
 * `pathname` arrives with no query string and no fragment: that is stripped in
 * the insert action (P1), so a feedback row physically cannot hold a search
 * somebody typed or a `#` they followed. The link below is safe to show as a
 * path for the same reason.
 */

export default async function AdminFeedbackPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireAdmin();
  const params = await searchParams;

  const requested = Array.isArray(params.status) ? params.status[0] : params.status;
  const status = FEEDBACK_STATUSES.find((option) => option === requested);

  const [items, counts] = await Promise.all([
    listFeedback(session.client, status),
    countFeedbackByStatus(session.client),
  ]);

  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
  const active = status ?? "any";

  return (
    <AdminPage
      title="Feedback"
      description="What testers said. It changes nothing about how anything is ranked — read it, then go and fix the thing."
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="All" value={total} />
        <Stat label="Unread" value={counts.new ?? 0} tone={(counts.new ?? 0) > 0 ? "worked" : "default"} />
        <Stat label="Read" value={counts.reviewed ?? 0} />
        <Stat label="Closed" value={counts.closed ?? 0} />
      </div>

      <div className="mt-4">
        <FilterTabs
          base="/admin/feedback"
          active={active}
          options={[
            { value: "any", label: "All", count: total },
            { value: "new", label: "Unread", count: counts.new ?? 0 },
            { value: "reviewed", label: "Read", count: counts.reviewed ?? 0 },
            { value: "closed", label: "Closed", count: counts.closed ?? 0 },
          ]}
        />
      </div>

      <div className="mt-4">
        <Panel>
          <FeedbackQueue items={items} />
        </Panel>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        Addresses are shown because the sender chose to leave one and this page is admin-only. No
        reply is sent from here, and nothing written on this page reaches a playbook&rsquo;s score.
      </p>
    </AdminPage>
  );
}