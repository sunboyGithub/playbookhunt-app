"use server";

import { z } from "zod";

import { adminSession } from "@/server/admin/session";
import { writeAdminAction } from "@/server/admin/audit";
import { revalidatePublicPlaybook } from "@/server/admin/revalidate";

/**
 * Deciding a creator's submission.
 *
 * ## Three decisions, and why "publish" is not one of them
 *
 * Approve, ask for changes, reject. Publishing is not offered as a fourth button
 * next to approve because approve *is* publishing: a submission is not visible to
 * readers until it is approved, so a button that did one without the other would
 * be a way to make something public without reviewing it.
 *
 * `request_changes` deliberately leaves the playbook at `in_review` rather than
 * dropping it to `draft`. The playbook is invisible to readers either way — RLS
 * publishes `status = 'published'` and nothing else — and `in_review` is the
 * truthful word for "there is something here and it has not been looked at yet".
 * `draft` would read, in the admin playbook list, as an author who never submitted.
 *
 * ## The note is required exactly where it is needed
 *
 * "Ask for changes" without saying what to change is not a review, it is a
 * rejection with extra steps — the creator cannot act on it and will read it as
 * one. Reject has the same problem and a worse outcome. Approve is the only one
 * where silence is a complete answer, so the note is optional there and capped,
 * because a note is a sentence to a person and not an essay field.
 *
 * ## Ordering: the submission first
 *
 * The status is written before the playbook's. If that order broke, the failure is
 * a submission marked approved whose playbook is still `in_review` — invisible,
 * recoverable, and it fails closed. The other order's failure is a playbook marked
 * published with no approved submission behind it, which is a page on the
 * internet nobody reviewed.
 *
 * This is not a transaction and cannot be one through PostgREST. The ordering is
 * the mitigation, for the same reason it is in `playbooks.ts`: a schema that grows
 * one SQL function per feature is worse than a documented ordering.
 */

const decisionSchema = z
  .object({
    playbookId: z.string().uuid(),
    decision: z.enum(["approve", "request_changes", "reject"]),
    note: z.string().trim().max(2000).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.decision !== "approve" && (value.note ?? "") === "") {
      ctx.addIssue({
        code: "custom",
        path: ["note"],
        message:
          value.decision === "reject"
            ? "Say why, so the creator is not left guessing."
            : "Say what to change, so the creator can act on it.",
      });
    }
  });

export type ReviewResult = { ok: true } | { ok: false; error: string; field?: string };

export async function reviewSubmission(input: unknown): Promise<ReviewResult> {
  const session = await adminSession();
  if (!session.ok) return session;

  const parsed = decisionSchema.safeParse(input);

  if (!parsed.success) {
    const issue = parsed.error.issues[0];

    return {
      ok: false,
      error: issue?.message ?? "That decision could not be recorded.",
      field: issue?.path[0] === "note" ? "note" : undefined,
    };
  }

  const { playbookId, decision, note } = parsed.data;

  const submissionStatus =
    decision === "approve" ? "approved" : decision === "reject" ? "rejected" : "changes_requested";

  // Read before writing, so the playbook is known to exist before anything is
  // changed and a bad id cannot half-apply.
  const { data: playbook, error: readError } = await session.client
    .from("playbooks")
    .select("slug, status")
    .eq("id", playbookId)
    .maybeSingle();

  if (readError || !playbook) {
    return { ok: false, error: "That submission is no longer in the queue." };
  }

  const { data: decided, error: submissionError } = await session.client
    .from("playbook_submissions")
    .update({
      status: submissionStatus,
      reviewer_note: note && note !== "" ? note : null,
      // `null` for `changes_requested` only: the check constraint requires a
      // decision to carry a timestamp, and asking for changes is not one.
      decided_at: submissionStatus === "changes_requested" ? null : new Date().toISOString(),
    })
    .eq("playbook_id", playbookId)
    .select("id")
    .maybeSingle();

  if (submissionError || !decided) {
    return { ok: false, error: `Could not record the decision: ${submissionError?.message ?? "not found"}` };
  }

  const nextPlaybookStatus =
    decision === "approve" ? "published" : decision === "reject" ? "archived" : playbook.status;

  if (nextPlaybookStatus !== playbook.status) {
    const { error: playbookError } = await session.client
      .from("playbooks")
      .update({ status: nextPlaybookStatus })
      .eq("id", playbookId);

    if (playbookError) {
      return {
        ok: false,
        error: `The decision was recorded but the page is still ${playbook.status}: ${playbookError.message}`,
      };
    }
  }

  // Only on the one path where something a reader can see actually changed.
  if (decision === "approve") {
    revalidatePublicPlaybook(playbook.slug);
  }

  await writeAdminAction(session.client, session.adminId, {
    action: `submission.${decision}`,
    target: playbook.slug,
    // The note is deliberately *not* in the audit payload. Audit rows are read
    // back more widely than review notes are meant to be, and the note is a
    // message to the creator; the decision and the target are the parts an audit
    // trail is for.
    payload: { playbookId },
  });

  return { ok: true };
}