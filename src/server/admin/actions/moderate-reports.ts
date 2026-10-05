"use server";

import { moderationSchema, type ModerationInput, type ReportDecision } from "@/lib/admin/moderation";
import type { Database } from "@/lib/database.types";
import { refreshAfterReportChange } from "@/lib/ranking/refresh-after";
import { adminSession } from "@/server/admin/session";
import { writeAdminAction } from "@/server/admin/audit";
import { revalidatePublicPlaybook } from "@/server/admin/revalidate";

/**
 * Approving, rejecting and flagging reports — one row or fifty.
 *
 * ## What this may and may not change
 *
 * The report's own answer is untouchable. `result`, `amount`, `hours_saved` and
 * `note` are the reporter's words and this action cannot write them, because a
 * number an administrator typed is a number nobody stood behind — the site
 * publishes statistics as *things people reported*, and the moment a moderator
 * can correct a report into shape the aggregate stops meaning what it says it
 * means. The moderation columns are the whole of what an admin can change.
 *
 * ## Why a rejection takes the report off the public page
 *
 * `status = 'rejected'` drops it out of `public_reports`, which filters on
 * `approved`. The row is kept, not deleted: the reporter can see it in /me, the
 * moderator can see why it was thrown out, and a decision made in a hurry can be
 * undone. Deleting somebody's report because it looked wrong would destroy the
 * evidence that it looked wrong.
 *
 * ## Why an outlier flag is not a rejection
 *
 * An outlier is a report whose number could not be right — somebody saved $700
 * on a plan that saves $12 — and it is excluded from the aggregates without being
 * removed from the page. A person who genuinely saved an unusual amount should
 * still see their result, and the brief's rule is that outliers weigh zero rather
 * than that they are punished.
 *
 * ## Why the bulk form validates the whole batch
 *
 * Fifty approvals and one rejection cannot be half-applied: the numbers would be
 * recomputed from whatever landed, and the moderator's screen would show a
 * failure they cannot tell apart from a partial success. So the reason is
 * checked once for the batch, and a rejection with no reason refuses the entire
 * submission.
 */

/** Enough for a real triage session; far past it, the bulk button is the wrong tool. */
const MAX_BULK = 200;

type ReportUpdate = Database["public"]["Tables"]["outcome_reports"]["Update"];

export type ModerationResult = { ok: true; applied: number } | { ok: false; error: string };

export async function moderateReports(input: {
  reportIds: string[];
  decision: ReportDecision;
  reason?: string | null;
}): Promise<ModerationResult> {
  const session = await adminSession();
  if (!session.ok) return session;

  const reportIds = [...new Set(input.reportIds ?? [])].filter(Boolean);
  if (reportIds.length === 0) {
    return { ok: false, error: "Pick at least one report." };
  }
  if (reportIds.length > MAX_BULK) {
    return { ok: false, error: `Moderate ${MAX_BULK} reports at a time.` };
  }

  const parsed = moderationSchema.safeParse({ decision: input.decision, reason: input.reason });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "That decision is not valid." };
  }

  const decision: ModerationInput = parsed.data;

  // Read first: the playbook ids are needed to refresh the right aggregates and
  // revalidate the right pages, and guessing them would revalidate the whole
  // site for a single report.
  const { data: reports, error: readError } = await session.client
    .from("outcome_reports")
    .select("id, playbook_id, playbooks!inner(slug)")
    .in("id", reportIds);

  if (readError) {
    return { ok: false, error: `Could not read those reports: ${readError.message}` };
  }

  if (!reports || reports.length === 0) {
    return { ok: false, error: "Those reports no longer exist." };
  }

  const { error: updateError } = await session.client
    .from("outcome_reports")
    .update(patchFor(decision))
    .in(
      "id",
      reports.map((row) => row.id),
    );

  if (updateError) {
    return { ok: false, error: `Could not apply that decision: ${updateError.message}` };
  }

  const slugs = new Map<string, string>();
  for (const row of reports) {
    const playbook = (
      row.playbooks as unknown as { slug?: string } | { slug?: string }[] | null
    ) as { slug?: string } | null;
    if (playbook?.slug) slugs.set(row.playbook_id, playbook.slug);
  }

  // Awaited, deliberately. P8 discovered the other failure mode — a fire-and-forget
  // fetch loses the request when the browser navigates — and a moderator who
  // clicks "reject" and lands on the playbook page must find it already gone.
  // The refresh swallows its own errors: a failed aggregation is retried by the
  // cron, and it must not read to the moderator as "the rejection failed".
  for (const playbookId of new Set(reports.map((row) => row.playbook_id))) {
    await refreshAfterReportChange(playbookId);
  }

  for (const slug of slugs.values()) {
    revalidatePublicPlaybook(slug);
  }

  await writeAdminAction(session.client, session.adminId, {
    action: `report.${decision.decision}`,
    target: reportIds.length === 1 ? reportIds[0] : `${reportIds.length} reports`,
    // The reason is deliberately absent. This log is read by other
    // administrators; the note stays with the report, which is one place, read
    // by the people deciding.
    payload: { reportIds, playbookIds: [...new Set(reports.map((row) => row.playbook_id))] },
  });

  return { ok: true, applied: reports.length };
}

/**
 * What each decision writes.
 *
 * Typed as the table's own update shape rather than as a generic object, so a
 * column that does not exist fails the build here instead of failing at the
 * database with a message nobody reading a moderation queue will understand.
 *
 * `moderation_note` is set on approve and on reject, and left alone when an
 * outlier is toggled — clearing the reason a report was rejected because
 * somebody later noticed the amount was an outlier would destroy the record of
 * the only decision that was actually made about it.
 */
function patchFor(decision: ModerationInput): ReportUpdate {
  switch (decision.decision) {
    case "approve":
      return { status: "approved", moderation_note: decision.reason ?? null };
    case "reject":
      return { status: "rejected", moderation_note: decision.reason ?? null };
    case "flag_outlier":
      return { is_outlier: true, ...(decision.reason ? { moderation_note: decision.reason } : {}) };
    case "unflag_outlier":
      return { is_outlier: false };
  }
}