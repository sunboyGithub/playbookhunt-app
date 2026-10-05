import Link from "next/link";

import { AdminPage, Panel, FilterTabs } from "@/components/admin/shell";
import { listAdminPlaybooks } from "@/server/admin/queries/playbooks";
import { requireAdmin } from "@/server/admin/session";

/**
 * Every playbook, in every state.
 *
 * The public list shows published things ordered by evidence. This one shows
 * everything ordered by when it was last touched, because the person opening
 * /admin/playbooks is usually looking for the one thing they were working on.
 *
 * The numbers on each row are the same numbers the ranking uses. They are read
 * for display only — there is no control anywhere in this area that writes a
 * score, a report count or a success rate, and there will not be one. If a
 * playbook's numbers are wrong the fix is to fix its reports, not to type the
 * right number here.
 */

const STATUSES = ["any", "draft", "published", "archived"] as const;

function date(value: string | null): string {
  return value ? new Date(value).toLocaleDateString() : "—";
}

export default async function AdminPlaybooksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireAdmin();
  const params = await searchParams;
  const requested = Array.isArray(params.status) ? params.status[0] : params.status;
  const status = STATUSES.find((option) => option === requested) ?? "any";

  const [items, all] = await Promise.all([
    listAdminPlaybooks(session.client, status),
    status === "any" ? Promise.resolve([]) : listAdminPlaybooks(session.client),
  ]);

  const counts = {
    any: status === "any" ? items.length : all.length,
    draft: all.filter((item) => item.status === "draft").length,
    published: all.filter((item) => item.status === "published").length,
    archived: all.filter((item) => item.status === "archived").length,
  };

  return (
    <AdminPage
      title="Playbooks"
      description="The catalogue. Editing the prompt or the inputs creates a new version — it never overwrites the one a report was filed against."
    >
      <FilterTabs
        base="/admin/playbooks"
        active={status}
        options={[
          { value: "any", label: "All", count: counts.any },
          { value: "draft", label: "Drafts", count: counts.draft },
          { value: "published", label: "Published", count: counts.published },
          { value: "archived", label: "Archived", count: counts.archived },
        ]}
      />

      <div className="mt-4">
        <Panel>
          {items.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nothing with that status. Submissions land here too — see the queue.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="pb-2 pr-3 font-medium">Title</th>
                  <th className="pb-2 pr-3 font-medium">Status</th>
                  <th className="pb-2 pr-3 text-right font-medium">Reports</th>
                  <th className="pb-2 pr-3 text-right font-medium">Tried</th>
                  <th className="pb-2 pr-3 text-right font-medium">Evidence</th>
                  <th className="pb-2 font-medium">Last verified</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map((item) => (
                  <tr key={item.id} data-testid="admin-playbook-row">
                    <td className="py-2.5 pr-3">
                      <Link
                        href={`/admin/playbooks/${item.id}`}
                        className="font-medium hover:underline"
                      >
                        {item.title}
                      </Link>
                      {item.categoryName ? (
                        <span className="text-xs text-muted-foreground"> · {item.categoryName}</span>
                      ) : null}
                    </td>
                    <td className="py-2.5 pr-3">
                      <span className="rounded bg-muted px-1.5 py-0.5 text-xs">{item.status}</span>
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">{item.reportCount}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">{item.triedCount}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">{item.evidenceScore.toFixed(3)}</td>
                    <td className="py-2.5 text-muted-foreground">
                      {date(item.lastVerifiedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        Evidence is the score the ranking uses, between 0 and 1. It moves because reports were filed
        and moderation decisions were made — there is no way to set it by hand, and the public
        numbers are derived from it rather than stored beside it.
      </p>
    </AdminPage>
  );
}