import Link from "next/link";

import { AdminPage, Panel } from "@/components/admin/shell";
import { ArrangedEditor } from "@/components/admin/arranged-editor";
import { getCollection } from "@/server/admin/queries/arranged";
import { listPlaybookOptions } from "@/server/admin/queries/playbooks";
import { requireAdmin } from "@/server/admin/session";

/**
 * One starter kit's editor.
 *
 * `new` is a route segment rather than a separate page: a new kit and an existing
 * one are the same form, and the only difference is that the second one has a
 * list of playbooks under the fields. Splitting them would mean two forms that
 * could disagree about what a kit is.
 *
 * The playbook list is part of this page rather than a link to somewhere else,
 * because the two things being edited are usually the same decision — "start with
 * the cheap one" is a change to the description and to the order at once.
 */

export default async function AdminCollectionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireAdmin();
  const { id } = await params;
  const creating = id === "new";

  const [collection, options] = await Promise.all([
    creating ? Promise.resolve(null) : getCollection(session.client, id),
    listPlaybookOptions(session.client),
  ]);

  // A missing id that is not "new" is a stale link, not a form to create from.
  if (!creating && !collection) {
    return (
      <AdminPage title="Not found" description="That kit is not here any more.">
        <p className="text-sm">
          It may have been deleted.{" "}
          <Link href="/admin/collections" className="underline">
            Back to the kits
          </Link>
          .
        </p>
      </AdminPage>
    );
  }

  return (
    <AdminPage
      title={creating ? "New starter kit" : (collection?.title ?? "")}
      description={
        creating
          ? "A title, a sentence about what it is for, and an ordered list of playbooks."
          : `/kits/${collection?.slug}`
      }
      actions={
        !creating ? (
          <>
            <Link
              href={`/kits/${collection?.slug}`}
              className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-foreground/20"
            >
              See it public
            </Link>
            <Link
              href="/admin/collections"
              className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-foreground/20"
            >
              All kits
            </Link>
          </>
        ) : (
          <Link
            href="/admin/collections"
            className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-foreground/20"
          >
            Cancel
          </Link>
        )
      }
    >
      <Panel>
        <ArrangedEditor
          table="collection"
          id={creating ? null : (collection?.id ?? null)}
          options={options}
          items={collection?.items ?? []}
          fields={
            collection
              ? {
                  title: collection.title,
                  slug: collection.slug,
                  blurb: collection.blurb ?? "",
                  illustrationUrl: collection.illustrationUrl ?? "",
                  gradientFrom: "#E8EFFC",
                  gradientTo: "#DCE7F5",
                  isFeatured: collection.isFeatured,
                  sort: collection.sort,
                }
              : null
          }
        />
      </Panel>
    </AdminPage>
  );
}