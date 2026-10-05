"use server";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import { evidenceReviewSchema, EVIDENCE_URL_TTL_SECONDS } from "@/lib/admin/moderation";
import { refreshAfterReportChange } from "@/lib/ranking/refresh-after";
import { mintEvidenceUrl } from "@/server/admin/queries/evidence";
import { adminSession } from "@/server/admin/session";
import { writeAdminAction } from "@/server/admin/audit";
import { revalidatePublicPlaybook } from "@/server/admin/revalidate";

/**
 * Deciding whether an attached file is real, and lending out a link to look at it.
 *
 * ## Why approving evidence marks the report verified
 *
 * The brief says approving evidence sets `is_verified`, and the reason is that
 * the two things are the same claim: "this result is checked". A report nobody
 * has seen a file for and a report whose file was looked at and accepted are not
 * different strengths of the same claim, they are the same claim. The tag on the
 * public page then means something a reader can act on.
 *
 * `last_verified_at` moves only when the result was `worked`, because that is the
 * only outcome where the file is evidence *the playbook does what it says*. A
 * screenshot of somebody's refund, on a playbook that did not work, is evidence
 * about their afternoon and not about the playbook.
 *
 * ## Why the rejection path recomputes the flag rather than clearing it
 *
 * A report can have more than one piece of evidence. Clearing
 * `evidence_reviewed` because one file was rejected would claim that no evidence
 * had been approved when another had — and that flag is the fact the public page
 * reads, so getting it wrong publishes a lie. The count is asked of the database
 * after the update, not remembered from before it.
 *
 * ## Why the preview takes an id and not a path
 *
 * `createSignedUrl` takes a storage path, and the storage policy lets an admin
 * read any object in the bucket. Accepting a path from the client would let
 * anybody who can reach this action mint a link to any file in it — so the path
 * is resolved here, from an id that must exist in `report_evidence`, and the
 * caller never gets to say which file.
 */

export type EvidenceResult = { ok: true } | { ok: false; error: string };

export async function reviewEvidence(input: {
  evidenceId: string;
  decision: "approve" | "reject";
  reason?: string | null;
}): Promise<EvidenceResult> {
  const session = await adminSession();
  if (!session.ok) return session;

  const parsed = evidenceReviewSchema.safeParse({ decision: input.decision, reason: input.reason });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "That decision is not valid." };
  }

  const { data: evidence, error: readError } = await session.client
    .from("report_evidence")
    .select("id, report_id, outcome_reports!inner(id, playbook_id, result)")
    .eq("id", input.evidenceId)
    .maybeSingle();

  if (readError) {
    return { ok: false, error: `Could not read that evidence: ${readError.message}` };
  }

  if (!evidence) {
    return { ok: false, error: "That evidence no longer exists." };
  }

  const report = (
    evidence.outcome_reports as unknown as
      | { id: string; playbook_id: string; result: string }
      | { id: string; playbook_id: string; result: string }[]
      | null
  ) as { id: string; playbook_id: string; result: string } | null;

  const reportId = report?.id ?? evidence.report_id;
  const playbookId = report?.playbook_id ?? "";
  const { decision, reason } = parsed.data;

  const { error: updateError } = await session.client
    .from("report_evidence")
    .update({ review_status: decision === "approve" ? "approved" : "rejected", review_note: reason })
    .eq("id", input.evidenceId);

  if (updateError) {
    return { ok: false, error: `Could not record that decision: ${updateError.message}` };
  }

  if (decision === "approve") {
    await markReportVerified(session.client, reportId, playbookId);
  } else {
    await syncEvidenceReviewed(session.client, reportId);
  }

  if (playbookId) {
    // `evidence_approved` is a term in the score and the gate on "Proven to
    // work", so approving a file is a ranking change like any other.
    await refreshAfterReportChange(playbookId);

    const { data: playbook } = await session.client
      .from("playbooks")
      .select("slug")
      .eq("id", playbookId)
      .maybeSingle();

    if (playbook) {
      revalidatePublicPlaybook(playbook.slug);
    }
  }

  await writeAdminAction(session.client, session.adminId, {
    action: `evidence.${decision}`,
    target: input.evidenceId,
    payload: { reportId, playbookId },
  });

  return { ok: true };
}

/** A short-lived link to one attached file. */
export async function previewEvidence(input: {
  evidenceId: string;
}): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const session = await adminSession();
  if (!session.ok) return session;

  const { data, error } = await session.client
    .from("report_evidence")
    .select("storage_path")
    .eq("id", input.evidenceId)
    .maybeSingle();

  if (error) {
    return { ok: false, error: `Could not read that evidence: ${error.message}` };
  }

  if (!data) {
    return { ok: false, error: "That evidence no longer exists." };
  }

  try {
    const url = await mintEvidenceUrl(session.client, data.storage_path, EVIDENCE_URL_TTL_SECONDS);
    return url ? { ok: true, url } : { ok: false, error: "Could not open that file." };
  } catch (cause) {
    return {
      ok: false,
      error: `Could not open that file: ${cause instanceof Error ? cause.message : "unknown error"}`,
    };
  }
}

/** Just the table client: the helpers below never mint links or touch storage. */
type Client = Pick<SupabaseClient<Database>, "from">;

/**
 * The report is verified; the playbook's verification date moves if the report
 * says it worked.
 */
async function markReportVerified(
  client: Client,
  reportId: string,
  playbookId: string,
): Promise<void> {
  const { error } = await client
    .from("outcome_reports")
    .update({ is_verified: true, evidence_reviewed: true })
    .eq("id", reportId);

  if (error) {
    throw new Error(`reviewEvidence: marking the report verified — ${error.message}`);
  }

  const { data: report } = await client
    .from("outcome_reports")
    .select("result")
    .eq("id", reportId)
    .maybeSingle();

  if (report?.result !== "worked" || !playbookId) {
    return;
  }

  const { error: verifiedError } = await client
    .from("playbooks")
    .update({ last_verified_at: new Date().toISOString() })
    .eq("id", playbookId);

  if (verifiedError) {
    throw new Error(`reviewEvidence: stamping last_verified_at — ${verifiedError.message}`);
  }
}

/**
 * Re-derive the public flag from the evidence rows that survived.
 *
 * Asked after the update rather than computed from it, so the flag describes the
 * table rather than the decision that was just made to it.
 */
async function syncEvidenceReviewed(client: Client, reportId: string): Promise<void> {
  const { data, error } = await client
    .from("report_evidence")
    .select("id")
    .eq("report_id", reportId)
    .eq("review_status", "approved");

  if (error) {
    throw new Error(`reviewEvidence: recounting approved evidence — ${error.message}`);
  }

  const { error: updateError } = await client
    .from("outcome_reports")
    .update({ evidence_reviewed: (data ?? []).length > 0 })
    .eq("id", reportId);

  if (updateError) {
    throw new Error(`reviewEvidence: clearing the reviewed flag — ${updateError.message}`);
  }
}