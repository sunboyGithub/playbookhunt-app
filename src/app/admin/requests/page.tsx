import Link from "next/link";

import { AdminPage, Panel, FilterTabs, Stat } from "@/components/admin/shell";
import { RequestInbox } from "@/components/admin/request-inbox";
import {
  DEFAULT_SIMILARITY,
  countRequestsByStatus,
  listRequestGroups,
} from "@/server/admin/queries/requests";
import { requireAdmin } from "@/server/admin/session";

/**
 * The requests inbox: what people asked for and the site does not have.
 *
 * ## Why the similarity threshold is a control here
 *
 * Grouping happens in Postgres on trigram similarity, and 0.55 is a guess about
 * how alike two sentences have to be before they are the same request. A guess is
 * fine to ship and bad to keep — so the number is a URL parameter and the page
 * says what it is. Turning it up separates; turning it down merges. Somebody who
 * thinks the grouping is wrong can see it being wrong at a threshold they chose,
 * rather than having to take it on trust.
 *
 * The grouping itself is `admin_request_inbox` (migrations 13 and 14), called
 * through `listRequestGroups`. There is no second similarity implementation to
 * disagree with it.
 *
 * ## Why the status tabs count requests and not groups
 *
 * The counts come from `playbook_requests` directly, so "14" next to Done means
 * fourteen people, not fourteen lines. The list below merges them; the number
 * beside the tab deliberately does not.
 */

const STATUSES = ["any", "new", "planned", "done"] as const;

export default async function AdminRequestsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireAdmin();
  const params = await searchParams;

  const requested = Array.isArray(params.status) ? params.status[0] : params.status;
  const status = STATUSES.find((option) => option === requested) ?? "any";

  const raw = Array.isArray(params.similar) ? params.similar[0] : params.similar;
  const parsed = raw === undefined ? Number.NaN : Number(raw);
  const minSimilarity =
    Number.isFinite(parsed) && parsed >= 0.1 && parsed <= 0.95 ? parsed : DEFAULT_SIMILARITY;

  const [groups, counts] = await Promise.all([
    listRequestGroups(session.client, session.adminId, minSimilarity),
    countRequestsByStatus(session.client),
  ]);

  const visible = status === "any" ? groups : groups.filter((group) => group.status === status);
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);

  return (
    <AdminPage
      title="Requests"
      description="What people asked for when the site could not find it. Nobody is emailed from here — publishing a playbook is how they find out."
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="All" value={total} />
        <Stat label="Unread" value={counts.new ?? 0} tone={(counts.new ?? 0) > 0 ? "worked" : "default"} />
        <Stat label="Planned" value={counts.planned ?? 0} />
        <Stat label="Built" value={counts.done ?? 0} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <FilterTabs
          base="/admin/requests"
          active={status}
          options={[
            { value: "any", label: "All", count: total },
            { value: "new", label: "Unread", count: counts.new ?? 0 },
            { value: "planned", label: "Planned", count: counts.planned ?? 0 },
            { value: "done", label: "Built", count: counts.done ?? 0 },
          ]}
        />

        <form action="/admin/requests" className="flex items-center gap-2">
          {status !== "any" ? <input type="hidden" name="status" value={status} /> : null}
          <label htmlFor="similar" className="text-sm text-muted-foreground">
            Group at
          </label>
          <input
            id="similar"
            name="similar"
            type="number"
            min={0.1}
            max={0.95}
            step={0.05}
            defaultValue={minSimilarity}
            className="w-24 rounded-lg border border-border bg-card px-2 py-1.5 text-sm"
          />
          <button
            type="submit"
            className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-foreground/20"
          >
            Regroup
          </button>
        </form>
      </div>

      <div className="mt-4">
        <Panel>
          <RequestInbox groups={visible} />
        </Panel>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        Grouped at similarity {minSimilarity.toFixed(2)} — two requests become one line when they
        are at least that alike. Higher separates more.{" "}
        <Link href="/search" className="underline">
          Search what exists
        </Link>{" "}
        before promising to build it; some of these may already be there under a different name.
      </p>
    </AdminPage>
  );
}