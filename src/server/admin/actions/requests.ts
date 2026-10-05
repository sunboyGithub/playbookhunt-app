"use server";

import { adminSession } from "@/server/admin/session";
import { writeAdminAction } from "@/server/admin/audit";

/**
 * Deciding what happens to a request: nothing yet, planned, or done.
 *
 * ## Why there is no "rejected"
 *
 * The column has three values and one of them is `done`. A person who asked for
 * something and was told no has not been served by the queue, and a two-state
 * flag would make "we are not building this" indistinguishable from "we have not
 * got to this" — which is how a founder ends up rebuilding a thing they declined
 * six months ago. `done` here means "answered, either way", and the reason lives
 * in the decision, not in a fourth status the inbox would have to render.
 *
 * ## Why deciding a group decides every request in it
 *
 * The inbox shows one line per thing people asked for, and the fourteen rows
 * behind it are the same request. Marking the line "planned" while leaving the
 * other thirteen as `new` would put them straight back at the top of the inbox as
 * fresh demand for something already agreed — so `setRequestStatus` takes a list,
 * and the list is the group.
 */

export type RequestStatus = "new" | "planned" | "done";

export type RequestResult = { ok: true; applied: number } | { ok: false; error: string };

/** Bounded by the inbox's own page, and generous enough for a bulk triage. */
const MAX_BULK = 200;

export async function setRequestStatus(input: {
  requestIds: string[];
  status: RequestStatus;
}): Promise<RequestResult> {
  const session = await adminSession();
  if (!session.ok) return session;

  const requestIds = [...new Set(input.requestIds ?? [])].filter(Boolean);

  if (requestIds.length === 0) {
    return { ok: false, error: "Pick at least one request." };
  }
  if (requestIds.length > MAX_BULK) {
    return { ok: false, error: `Decide ${MAX_BULK} requests at a time.` };
  }
  if (input.status !== "new" && input.status !== "planned" && input.status !== "done") {
    return { ok: false, error: "That isn't a state a request can be in." };
  }

  const { error } = await session.client
    .from("playbook_requests")
    .update({
      status: input.status,
      // `decided_at` is set when a decision is made and cleared when it is
      // withdrawn, so "planned last month and never built" is distinguishable
      // from "planned and shipped" without a second column.
      decided_at: input.status === "new" ? null : new Date().toISOString(),
    })
    .in("id", requestIds);

  if (error) {
    return { ok: false, error: `Could not save that: ${error.message}` };
  }

  await writeAdminAction(session.client, session.adminId, {
    action: `request.${input.status}`,
    target: requestIds.length === 1 ? requestIds[0]! : `${requestIds.length} requests`,
    payload: { requestIds },
  });

  return { ok: true, applied: requestIds.length };
}