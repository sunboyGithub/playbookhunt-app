import Link from "next/link";

import { AdminPage, Panel, FilterTabs, Stat } from "@/components/admin/shell";
import { EvidenceQueue } from "@/components/admin/evidence-queue";
import {
  EVIDENCE_STATUSES,
  listEvidence,
  type EvidenceStatus,
} from "@/server/admin/queries/evidence";
import { requireAdmin } from "@/server/admin/session";

/**
 * The evidence queue.
 *
 * One file at a time, oldest first. Oldest rather than newest because a file
 * somebody uploaded three weeks ago is the one a reporter is still waiting to
 * hear about, and the queue has no other way of remembering it.
 *
 * The tabs are the three review states. `pending` is the default and is what the
 * dashboard links to, because the other two are history.
 *
 * Accepting a file marks its report verified and, if that report said the
 * playbook worked, stamps the playbook's last-verified date. Both happen in the
 * action, not here — the page's job is to show the queue, not to know what
 * approving does.
 */

export default async function AdminEvidencePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireAdmin();
  const params = await searchParams;

  const requested = Array.isArray(params.status) ? params.status[0] : params.status;
  const status: EvidenceStatus = EVIDENCE_STATUSES.find((option) => option === requested) ?? "pending";

  const [items, pending, approved, rejected] = await Promise.all([
    listEvidence(session.client, status),
    listEvidence(session.client, "pending"),
    listEvidence(session.client, "approved"),
    listEvidence(session.client, "rejected"),
  ]);

  return (
    <AdminPage
      title="Evidence"
      description="Files people attached to their reports. They went to a private bucket, they are visible to the uploader and to you, and nobody else has a link to them."
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Waiting" value={pending.length} tone={pending.length > 0 ? "worked" : "default"} />
        <Stat label="Accepted" value={approved.length} />
        <Stat label="Rejected" value={rejected.length} />
      </div>

      <div className="mt-4">
        <FilterTabs
          base="/admin/evidence"
          active={status}
          options={[
            { value: "pending", label: "Waiting", count: pending.length },
            { value: "approved", label: "Accepted", count: approved.length },
            { value: "rejected", label: "Rejected", count: rejected.length },
          ]}
        />
      </div>

      <div className="mt-4">
        <Panel>
          <EvidenceQueue items={items} />
        </Panel>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        Files arrive redacted, or they do not arrive. If one contains somebody else&rsquo;s name, an
        account number or a customer list, reject it and ask for a new one rather than accepting it
        and hoping.{" "}
        <Link href="/admin/reports?evidence=pending" className="underline">
          See the reports these files belong to
        </Link>
        .
      </p>
    </AdminPage>
  );
}
