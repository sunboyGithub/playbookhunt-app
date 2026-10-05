import Link from "next/link";

import { nowMs } from "@/server/clock";

/**
 * A creator's own submissions, and the only place they learn what happened.
 *
 * ## The reviewer's note is the payload
 *
 * This list exists for one moment: somebody pressed Submit, and then nothing
 * happened for a while. Without it they have no way to find out whether the
 * submission arrived. So the note is shown in full, not truncated behind a
 * disclosure — a reviewer asked for changes, and the changes are in that sentence.
 *
 * ## Status is described, not coloured
 *
 * The words carry the meaning; the colour is decoration over them. A row that is
 * `changes_requested` says so in words a creator can act on, and the action beside
 * it is the action that status allows. Nothing here is a percentage, a badge
 * count, or anything a reader would take for evidence — this is one creator's own
 * work and its own review, and it never touches ranking.
 *
 * Drafts with no submission at all are here too, because "saved but never
 * submitted" is a state somebody is in and would otherwise have no way to see.
 */

type DraftRow = {
  draftId: string;
  playbookId: string | null;
  slug: string | null;
  title: string;
  reviewStatus: string | null;
  reviewerNote: string | null;
  updatedAt: string;
};

/** Plain words for each state, and whether editing is open in that state. */
function describe(status: string | null): { label: string; tone: string } {
  switch (status) {
    case "in_review":
      return { label: "With a reviewer", tone: "text-muted-foreground" };
    case "changes_requested":
      return { label: "Changes asked for", tone: "text-muse-dark" };
    case "approved":
      return { label: "Published", tone: "text-muted-foreground" };
    case "rejected":
      return { label: "Not accepted", tone: "text-muted-foreground" };
    default:
      return { label: "Draft, not submitted", tone: "text-muted-foreground" };
  }
}

function relativeDate(iso: string, now: number): string {
  const then = Date.parse(iso);

  if (!Number.isFinite(then)) return "";

  const minutes = Math.max(0, Math.round((now - then) / 60_000));

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;

  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;

  return new Date(then).toLocaleDateString();
}

export function SubmissionList({ drafts }: { drafts: DraftRow[] }) {
  // One instant for the whole list, read once rather than per row — otherwise
  // "2 days ago" could disagree with itself down the page. `nowMs()` rather than
  // `Date.now()`, which the React Compiler rejects during render.
  const now = nowMs();

  if (drafts.length === 0) {
    return (
      <div className="mt-8 space-y-3 rounded-lg border border-dashed border-border p-8 text-center">
        <p className="text-sm text-muted-foreground">You have not written anything yet.</p>
        <Link href="/create" className="text-sm underline underline-offset-2">
          Write a playbook
        </Link>
      </div>
    );
  }

  return (
    <ul className="mt-6 divide-y divide-border" data-testid="submission-list">
      {drafts.map((draft) => {
        const { label, tone } = describe(draft.reviewStatus);
        // Only these two states let the creator type again; the database refuses
        // everything else, so offering an edit link for them would be a lie.
        const editable = draft.reviewStatus === null || draft.reviewStatus === "changes_requested";

        return (
          <li key={draft.draftId} className="py-4" data-testid={`submission-${draft.reviewStatus ?? "draft"}`}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <div className="min-w-0">
                <p className="font-medium">{draft.title === "" ? "Untitled draft" : draft.title}</p>
                <p className="text-sm text-muted-foreground">
                  <span className={tone}>{label}</span>
                  {" · "}
                  {relativeDate(draft.updatedAt, now)}
                </p>
              </div>

              <div className="flex shrink-0 gap-3 text-sm">
                {editable ? (
                  <Link href={`/create?draft=${draft.draftId}`} className="underline underline-offset-2">
                    Edit
                  </Link>
                ) : null}
                {draft.reviewStatus === "approved" && draft.slug ? (
                  <Link href={`/p/${draft.slug}`} className="underline underline-offset-2">
                    View
                  </Link>
                ) : null}
              </div>
            </div>

            {draft.reviewerNote ? (
              <p className="mt-2 border-l-2 border-muse/40 pl-3 text-sm text-muted-foreground">
                {draft.reviewerNote}
              </p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}