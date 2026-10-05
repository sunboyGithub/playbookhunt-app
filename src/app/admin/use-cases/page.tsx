import Link from "next/link";
import { Plus } from "lucide-react";

import { AdminPage, Panel, Stat } from "@/components/admin/shell";
import { listUseCases } from "@/server/admin/queries/arranged";
import { requireAdmin } from "@/server/admin/session";

/**
 * Popular Use Cases.
 *
 * The same shape as starter kits and for the same reason: a hand-arranged list
 * that reflects an editorial judgement rather than a measurement. A use case
 * says "here is the situation this is for"; a kit says "here is the order to do
 * it in". Both are opinions, and neither is a ranking — nothing in
 * `src/lib/ranking/` reads either table.
 *
 * The only real difference is presentation: a use case is a card with a gradient
 * on the search page, so it has two hex colours and a description.
 */

export default async function AdminUseCasesPage() {
  const session = await requireAdmin();
  const useCases = await listUseCases(session.client);
  const playbooksInUse = useCases.reduce((sum, useCase) => sum + useCase.itemCount, 0);

  return (
    <AdminPage
      title="Use cases"
      description="The situations people arrive with. Each one shows the playbooks that fit it, in an order somebody chose."
      actions={
        <Link
          href="/admin/use-cases/new"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm transition-colors hover:border-foreground/20"
        >
          <Plus className="size-4" aria-hidden />
          New use case
        </Link>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Use cases" value={useCases.length} />
        <Stat label="Playbooks placed" value={playbooksInUse} hint="Some are in more than one" />
      </div>

      <div className="mt-4">
        <Panel>
          {useCases.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              None yet. They are how somebody who does not know what to search for still finds the
              right page.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="pb-2 pr-3 font-medium">Title</th>
                  <th className="pb-2 pr-3 font-medium">Gradient</th>
                  <th className="pb-2 font-medium">Playbooks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {useCases.map((useCase) => (
                  <tr key={useCase.id} data-testid="admin-use-case-row">
                    <td className="py-2.5 pr-3">
                      <Link
                        href={`/admin/use-cases/${useCase.id}`}
                        className="font-medium hover:underline"
                      >
                        {useCase.title}
                      </Link>
                      {useCase.description ? (
                        <span className="block text-xs text-muted-foreground">
                          {useCase.description.length > 90
                            ? `${useCase.description.slice(0, 90)}…`
                            : useCase.description}
                        </span>
                      ) : null}
                    </td>
                    <td className="py-2.5 pr-3">
                      <span
                        aria-hidden
                        className="inline-block h-5 w-16 rounded"
                        style={{
                          background: `linear-gradient(to right, ${useCase.gradientFrom}, ${useCase.gradientTo})`,
                        }}
                      />
                    </td>
                    <td className="py-2.5 tabular-nums">{useCase.itemCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>
    </AdminPage>
  );
}