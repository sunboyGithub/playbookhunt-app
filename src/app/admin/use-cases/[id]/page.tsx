import Link from "next/link";

import { AdminPage, Panel } from "@/components/admin/shell";
import { ArrangedEditor } from "@/components/admin/arranged-editor";
import { getUseCase } from "@/server/admin/queries/arranged";
import { listPlaybookOptions } from "@/server/admin/queries/playbooks";
import { requireAdmin } from "@/server/admin/session";

/**
 * One use case's editor. The mirror of the starter kit's, down to the `new`
 * segment and the shared `ArrangedEditor` — the two differ only in the fields
 * they show and the table they write to.
 */

export default async function AdminUseCasePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireAdmin();
  const { id } = await params;
  const creating = id === "new";

  const [useCase, options] = await Promise.all([
    creating ? Promise.resolve(null) : getUseCase(session.client, id),
    listPlaybookOptions(session.client),
  ]);

  if (!creating && !useCase) {
    return (
      <AdminPage title="Not found" description="That use case is not here any more.">
        <p className="text-sm">
          It may have been deleted.{" "}
          <Link href="/admin/use-cases" className="underline">
            Back to the use cases
          </Link>
          .
        </p>
      </AdminPage>
    );
  }

  return (
    <AdminPage
      title={creating ? "New use case" : (useCase?.title ?? "")}
      description={
        creating
          ? "Name the situation somebody arrives in, then list the playbooks that fit it."
          : `/use-cases/${useCase?.slug}`
      }
      actions={
        !creating ? (
          <>
            <Link
              href={`/use-cases/${useCase?.slug}`}
              className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-foreground/20"
            >
              See it public
            </Link>
            <Link
              href="/admin/use-cases"
              className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-foreground/20"
            >
              All use cases
            </Link>
          </>
        ) : (
          <Link
            href="/admin/use-cases"
            className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-foreground/20"
          >
            Cancel
          </Link>
        )
      }
    >
      <Panel>
        <ArrangedEditor
          table="use_case"
          id={creating ? null : (useCase?.id ?? null)}
          options={options}
          items={useCase?.items ?? []}
          fields={
            useCase
              ? {
                  title: useCase.title,
                  slug: useCase.slug,
                  blurb: useCase.description ?? "",
                  illustrationUrl: "",
                  gradientFrom: useCase.gradientFrom,
                  gradientTo: useCase.gradientTo,
                  isFeatured: false,
                  sort: useCase.sort,
                }
              : null
          }
        />
      </Panel>
    </AdminPage>
  );
}