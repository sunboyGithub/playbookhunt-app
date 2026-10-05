"use server";

import { adminSession } from "@/server/admin/session";
import { writeAdminAction } from "@/server/admin/audit";

/**
 * Closing out tester feedback.
 *
 * Three states and no reply button: `new` is unread, `reviewed` is somebody has
 * read it, `closed` is somebody has dealt with it. There is no reply, and that is
 * a deliberate gap rather than an unfinished feature — a reply means collecting
 * somebody's address and sending mail from a queue about a page they were on, and
 * the footer already offers a way to write in.
 *
 * Feedback never affects ranking. Nothing in `src/lib/ranking/` reads this table,
 * no score is derived from it, and this action writes to nothing but the
 * `feedback` row and the audit log.
 */

export type FeedbackStatus = "new" | "reviewed" | "closed";

export type FeedbackActionResult = { ok: true } | { ok: false; error: string };

export async function setFeedbackStatus(input: {
  feedbackId: string;
  status: FeedbackStatus;
}): Promise<FeedbackActionResult> {
  const session = await adminSession();
  if (!session.ok) return session;

  if (input.status !== "new" && input.status !== "reviewed" && input.status !== "closed") {
    return { ok: false, error: "That isn't a state feedback can be in." };
  }

  const { error } = await session.client
    .from("feedback")
    .update({ status: input.status })
    .eq("id", input.feedbackId);

  if (error) {
    return { ok: false, error: `Could not save that: ${error.message}` };
  }

  await writeAdminAction(session.client, session.adminId, {
    action: `feedback.${input.status}`,
    target: input.feedbackId,
  });

  return { ok: true };
}