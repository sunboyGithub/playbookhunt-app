import Link from "next/link";
import { Plus } from "lucide-react";

import { AdminPage, Panel, Stat } from "@/components/admin/shell";
import { listCollections } from "@/server/admin/queries/arranged";
import { requireAdmin } from "@/server/admin/session";

/**
 * Starter kits.
 *
 * The short, opinionated lists — "the three things to do first", "if you only
 * have an afternoon". Each one is a hand-picked set of playbooks in a hand-picked
 * order, and the featured flag decides which of them gets the slot on the home
 * page.
 *
 * None of this is a ranking. A kit is an editor's opinion about a sequence, and
 * the ranking in `src/lib/ranking/` never reads this table — a playbook's place
 * in a kit is not evidence that it works, so it is not treated as any.
 */

export default async function AdminCollectionsPage() {
  const session = await requireAdmin();
  const collections = await listCollections(session.client);

  const featured = collections.filter((collection) => collection.isFeatured);
  const playbooksInKits = collections.reduce((sum, collection) => sum + collection.itemCount, 0);

  return (
    <AdminPage
      title="Starter kits"
      description="Short, opinionated lists of playbooks. The order is part of the idea — a kit that starts with the wrong thing is a worse kit."
      actions={
        <Link
          href="/admin/collections/new"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm transition-colors hover:border-foreground/20"
        >
          <Plus className="size-4" aria-hidden />
          New kit
        </Link>
      }
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Kits" value={collections.length} />
        <Stat label="Featured" value={featured.length} hint="Shown on the home page" />
        <Stat label="Playbooks placed" value={playbooksInKits} hint="Some are in more than one" />
      </div>

      <div className="mt-4">
        <Panel>
          {collections.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No kits yet. One is a title, a sentence about what it is for, and an ordered list.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="pb-2 pr-3 font-medium">Title</th>
                  <th className="pb-2 pr-3 font-medium">Address</th>
                  <th className="pb-2 pr-3 text-right font-medium">Playbooks</th>
                  <th className="pb-2 font-medium">Featured</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {collections.map((collection) => (
                  <tr key={collection.id} data-testid="admin-collection-row">
                    <td className="py-2.5 pr-3">
                      <Link
                        href={`/admin/collections/${collection.id}`}
                        className="font-medium hover:underline"
                      >
                        {collection.title}
                      </Link>
                      {collection.blurb ? (
                        <span className="block text-xs text-muted-foreground">
                          {collection.blurb.length > 90
                            ? `${collection.blurb.slice(0, 90)}…`
                            : collection.blurb}
                        </span>
                      ) : null}
                    </td>
                    <td className="py-2.5 pr-3 font-mono text-xs text-muted-foreground">
                      /kits/{collection.slug}
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">{collection.itemCount}</td>
                    <td className="py-2.5">{collection.isFeatured ? "Yes" : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        A kit with no playbooks in it is a page that says &ldquo;nothing yet&rdquo;. That is a
        legitimate thing to ship — it invites people to ask for the first one — but it is worth
        knowing that is what you published.
      </p>
    </AdminPage>
  );
}