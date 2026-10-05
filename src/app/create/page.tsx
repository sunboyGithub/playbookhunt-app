import type { Metadata } from "next";

import { CreateForm } from "@/components/create/create-form";
import { getViewer } from "@/lib/auth/viewer";
import { listCategories } from "@/server/queries/taxonomy";
import { loadOwnDraft } from "@/server/queries/create";

/**
 * The submission form.
 *
 * ## Why a signed-out visitor gets the whole form
 *
 * The redirect-on-no-session version of this page is one line and it is the wrong
 * one. Somebody arrives from a search result, decides they want to write one, and
 * is sent to a login page having learned nothing about what the site thinks is
 * worth writing — and then has to find their way back here with their idea intact.
 * The form works signed out; only saving and submitting need an account, and it
 * says so at the point where that becomes true rather than at the top.
 *
 * ## Why the draft comes from a query parameter
 *
 * `/create?draft=<id>` is how "My submissions" reopens something. The id is not
 * trusted: `loadOwnDraft` reads it through the creator's own RLS-scoped client,
 * so an id belonging to somebody else returns nothing and the page renders a blank
 * form rather than a leak.
 */
export const metadata: Metadata = {
  title: "Create a playbook",
  description: "Write a playbook and submit it for review.",
  // A submission form in a search index is a page nobody wants landing there.
  robots: { index: false, follow: true },
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ draft?: string }>;
}) {
  const { draft: draftId } = await searchParams;

  const [viewer, categories] = await Promise.all([
    getViewer(),
    // The taxonomy is the one thing the form cannot invent: the category column
    // is a foreign key, so an id that is not in this table fails at submit with a
    // message about a constraint rather than about a missing choice.
    listCategories().catch(() => []),
  ]);

  const loaded = draftId ? await loadOwnDraft(draftId).catch(() => null) : null;

  return (
    <CreateForm
      signedIn={viewer !== null}
      categories={categories.map((category) => ({
        id: category.id,
        name: category.name,
        emoji: category.emoji,
      }))}
      initialDraft={loaded?.draft}
      initialDraftId={loaded?.draftId}
      initialRevision={loaded?.revision}
      resumeStatus={loaded?.reviewStatus}
      resumeNote={loaded?.reviewerNote}
      // A draft under review or already approved is locked by a database trigger.
      // The form says so rather than letting the creator type into a field whose
      // every save will be refused.
      locked={loaded !== null && !loaded.editable}
    />
  );
}