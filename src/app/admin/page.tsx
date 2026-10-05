import Link from "next/link";

import { AdminPage, AdminEmpty, Panel, Stat } from "@/components/admin/shell";
import { loadDashboard } from "@/server/admin/queries/dashboard";
import { requireAdmin } from "@/server/admin/session";

/**
 * The dashboard.
 *
 * Six numbers and two lists, and the shape of that is the design: what has
 * happened lately, what is waiting, and the two rankings side by side.
 *
 * The two lists are the interesting part. `Top by evidence` is what the site
 * publishes — the ranking readers see and the one the non-negotiable rules in
 * AGENTS.md govern. `Top by trending` is what people clicked on this week. They
 * are almost never the same five, and the difference is the most useful thing a
 * founder can look at: a playbook that everybody tries and nobody reports on is
 * either a very good playbook whose results are not being collected, or one that
 * does not work and nobody has filed a report about. Neither can be told apart
 * from the other from a single list, which is why both are here.
 *
 * The site header is above this and the site footer is below it, and neither is
 * removed. /admin is a page of the same product rather than a separate tool, and
 * an admin who cannot get back to the site they are moderating from the queue is
 * an admin who will end up in the wrong place.
 */

export default async function AdminDashboardPage() {
  const session = await requireAdmin();
  const dashboard = await loadDashboard(session.client);

  const hasWork = dashboard.pendingReports + dashboard.pendingEvidence + dashboard.openRequests > 0;

  return (
    <AdminPage
      title="Dashboard"
      description="What has happened lately, what is waiting for a decision, and how the catalogue is doing."
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Published" value={dashboard.publishedPlaybooks} href="/admin/playbooks" />
        <Stat label="Tries · 7d" value={dashboard.triesThisWeek} />
        <Stat label="Reports · 7d" value={dashboard.reportsThisWeek} />
        <Stat
          label="Pending reports"
          value={dashboard.pendingReports}
          href="/admin/reports?status=pending"
          tone={dashboard.pendingReports > 0 ? "worked" : "default"}
        />
        <Stat
          label="Pending evidence"
          value={dashboard.pendingEvidence}
          href="/admin/evidence"
          tone={dashboard.pendingEvidence > 0 ? "worked" : "default"}
        />
        <Stat label="Open requests" value={dashboard.openRequests} href="/admin/requests" />
      </div>

      {hasWork ? (
        <p className="mt-4 text-sm text-muted-foreground">
          {dashboard.pendingReports > 0 ? (
            <>
              <Link className="font-medium text-foreground underline" href="/admin/reports?status=pending">
                {dashboard.pendingReports} report{dashboard.pendingReports === 1 ? "" : "s"}
              </Link>
              {dashboard.pendingReports === 1 ? " is" : " are"} waiting on a decision.
            </>
          ) : null}
          {dashboard.pendingEvidence > 0 ? (
            <>
              {dashboard.pendingReports > 0 ? " " : null}
              <Link className="font-medium text-foreground underline" href="/admin/evidence">
                {dashboard.pendingEvidence} evidence file
                {dashboard.pendingEvidence === 1 ? "" : "s"}
              </Link>{" "}
              to look at.
            </>
          ) : null}
          {dashboard.openRequests > 0 ? (
            <>
              {dashboard.pendingReports > 0 || dashboard.pendingEvidence > 0 ? " " : null}
              <Link className="font-medium text-foreground underline" href="/admin/requests">
                {dashboard.openRequests} request{dashboard.openRequests === 1 ? "" : "s"}
              </Link>{" "}
              to read.
            </>
          ) : null}
        </p>
      ) : null}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Panel title="Top by evidence" description="The order readers see. The ranking AGENTS.md governs.">
          <RankingList rows={dashboard.topByEvidence} scoreKey="evidenceScore" />
        </Panel>

        <Panel
          title="Top by trending"
          description="What people tried this week, which is not the same list."
        >
          <RankingList rows={dashboard.topByTrending} scoreKey="trendingScore" />
        </Panel>
      </div>
    </AdminPage>
  );
}

function RankingList({
  rows,
  scoreKey,
}: {
  rows: { slug: string; title: string; evidenceScore: number; trendingScore: number; reportCount: number; triedCount: number }[];
  scoreKey: "evidenceScore" | "trendingScore";
}) {
  if (rows.length === 0) {
    return (
      <AdminEmpty>
        Nothing has stats yet. They appear once playbooks have tried a prompt — the numbers are
        never written by hand.
      </AdminEmpty>
    );
  }

  return (
    <ol className="divide-y divide-border">
      {rows.map((row, index) => (
        <li key={row.slug} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
          <span className="w-5 text-xs tabular-nums text-muted-foreground">{index + 1}</span>
          <div className="min-w-0 flex-1">
            <Link
              href={`/p/${row.slug}`}
              className="block truncate text-sm font-medium hover:underline"
            >
              {row.title}
            </Link>
            <p className="text-xs text-muted-foreground">
              {row.reportCount} report{row.reportCount === 1 ? "" : "s"} ·{" "}
              {row.triedCount} tried
            </p>
          </div>
          <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
            {row[scoreKey].toFixed(3)}
          </span>
        </li>
      ))}
    </ol>
  );
}