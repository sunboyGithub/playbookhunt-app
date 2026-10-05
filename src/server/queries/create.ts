import "server-only";

import { createClient } from "@/lib/supabase/server";
import { emptyDraft, type DraftContent } from "@/lib/create/shape";

/**
 * One of the creator's own drafts, for reopening `/create`.
 *
 * ## Why this takes an id at all, given RLS already scopes it
 *
 * It could find "the most recent draft" with no argument and let RLS decide — but
 * "the most recent" is the wrong question. A creator with three drafts needs the
 * one they clicked, and the click is a draft id in the URL. Passing it does not
 * weaken anything: the read runs through the reader's own client, so a draft
 * belonging to somebody else returns nothing rather than returning something
 * filtered afterwards.
 *
 * ## Why a draft with a live submission comes back with its review state
 *
 * `changes_requested` is the one status a creator can act on, and it is
 * unreachable without the note the reviewer wrote. Fetching them together means
 * the page can say what to change on load, rather than making the creator write
 * "can I edit this?" and wait.
 *
 * A draft whose submission is `in_review` or `approved` is locked by a database
 * trigger, so it is returned with `editable: false` — the form will show it, but
 * the creator's edits would be refused anyway, and refusing them at the server
 * with no explanation is a worse experience than saying so here.
 */
export type LoadedDraft = {
  draft: DraftContent;
  draftId: string;
  revision: number;
  reviewStatus: string | null;
  reviewerNote: string | null;
  editable: boolean;
};

export async function loadOwnDraft(draftId: string): Promise<LoadedDraft | null> {
  const supabase = await createClient();
  const { data: sessionData } = await supabase.auth.getUser();

  if (!sessionData.user?.id) {
    return null;
  }

  const { data, error } = await supabase
    .from("playbook_drafts")
    .select(
      `id, revision, content, playbook:playbooks(slug, title, submission:playbook_submissions(status, reviewer_note))`,
    )
    .eq("id", draftId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const reviewStatus = data.playbook?.submission?.status ?? null;

  // Merged onto a fresh draft rather than trusted as-is: `content` is whatever
  // the last save wrote, and a field added to `DraftContent` since then would
  // otherwise arrive as `undefined` and crash a controlled input.
  const stored = (data.content ?? {}) as Partial<DraftContent>;

  return {
    draft: { ...emptyDraft(), ...stored },
    draftId: data.id,
    revision: data.revision,
    reviewStatus,
    reviewerNote: data.playbook?.submission?.reviewer_note ?? null,
    editable: reviewStatus === null || reviewStatus === "changes_requested",
  };
}