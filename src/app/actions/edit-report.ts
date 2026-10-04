"use server";

import { revalidatePath } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { reportSchema } from "@/lib/report/schema";
import {
  AMOUNT_CAPS,
  REPORT_EDIT_WINDOW_HOURS,
  evidenceExtension,
  evidenceKind,
  reportFieldsFrom,
  type OutcomeType,
} from "@/lib/report/shape";
import { nowMs } from "@/server/clock";

/**
 * Change or withdraw a report you already filed.
 *
 * ## The 24-hour window is the whole design
 *
 * The brief allows editing a report for 24 hours and deleting it forever. Both
 * exist because the alternative — being unable to correct yourself — makes a
 * mistaken answer permanent and public, which is how a site built on volunteered
 * data ends up publishing numbers nobody stands behind. After 24 hours an edit
 * would rewrite an aggregate that other people have already read and acted on, so
 * it stops being a correction and starts being a revision. Deletion stays open
 * because withdrawing data should not need a permission slip.
 *
 * The window is checked **server-side against the row's own `created_at`**, not
 * against anything the client sends. A client-side timer is a display
 * affordance; if it were the rule, the rule would be "edit within 24 hours if
 * you know how to set your clock back".
 *
 * ## Ownership
 *
 * Read through the service-role client rather than the RLS client, because
 * `outcome_reports.user_id` carries no client grant — that is deliberate, so a
 * reporter's identity cannot be enumerated. The consequence is that the
 * `user_id` filter below is load-bearing rather than defence in depth, so it is
 * applied to the update itself and not only to the read that precedes it.
 */

export type EditReportResult =
  | { ok: true; slug: string }
  | { ok: false; error: string; field?: string };

/** A report within the window, or a reason it is not. */
export async function editReport(input: {
  reportId: string;
  playbookId: string;
  versionId: string;
  result: string;
  amount?: string | null;
  unit?: string | null;
  hoursSaved?: string | null;
  timeSpentBucket?: string | null;
  provider?: string | null;
  region?: string | null;
  note?: string | null;
  agentSlug?: string | null;
}): Promise<EditReportResult> {
  const supabase = await createClient();
  const { data: sessionData } = await supabase.auth.getUser();
  const userId = sessionData.user?.id;

  if (!userId) {
    return { ok: false, error: "Sign in to change your report." };
  }

  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("outcome_reports")
    .select("id, user_id, playbook_id, version_id, created_at")
    .eq("id", input.reportId)
    .maybeSingle();

  if (!existing || existing.user_id !== userId) {
    // Same answer for "does not exist" and "not yours". Distinguishing them
    // would confirm the existence of reports this site's design keeps private.
    return { ok: false, error: "That report isn't yours to change." };
  }

  const deadline =
    new Date(existing.created_at).getTime() + REPORT_EDIT_WINDOW_HOURS * 3_600_000;

  if (nowMs() > deadline) {
    return {
      ok: false,
      error: `Reports can be changed for ${REPORT_EDIT_WINDOW_HOURS} hours. After that they're part of a published number — you can still delete it, which takes it out of the counts entirely.`,
    };
  }

  // The playbook is re-read, not trusted: the schema below is built from its
  // outcome type, its cap and its provider options, all of which the caller
  // could otherwise choose.
  const { data: playbook } = await supabase
    .from("playbooks")
    .select("id, slug, status, outcome_type, outcome_unit, report_fields")
    .eq("id", input.playbookId)
    .maybeSingle();

  if (!playbook || playbook.status !== "published") {
    return { ok: false, error: "That playbook isn't available." };
  }

  const outcomeType = (playbook.outcome_type ?? null) as OutcomeType | null;
  const extraFields = reportFieldsFrom(playbook.report_fields);
  const providerOptions = extraFields.find((field) => field.key === "provider")?.options ?? [];
  const regionOptions = extraFields.find((field) => field.key === "region")?.options ?? [];

  const parsed = reportSchema(outcomeType, providerOptions, regionOptions).safeParse({
    ...input,
    // Evidence is not part of an edit. Swapping a file would let a reader
    // replace an approved piece of evidence with something else under the same
    // review decision; deleting and re-reporting is the honest way to do that,
    // and it leaves a gap in the record instead of hiding one.
    evidence: undefined,
    playbookId: input.playbookId,
    versionId: input.versionId,
  });

  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      error: issue?.message ?? "Check the form and try again.",
      field: issue?.path.join(".") ?? undefined,
    };
  }

  const report = parsed.data;
  const collectsHours = outcomeType === "time_hours";
  const cap = outcomeType ? AMOUNT_CAPS[outcomeType] : 0;
  const value = collectsHours ? report.hoursSaved : report.amount;

  // Editing is treated exactly like filing: an amount above the cap is an
  // outlier and waits for review. A correct that only hides itself when the
  // number is large is not a correction.
  const isOutlier = value !== null && cap > 0 && value > cap;

  const { data: agentRow } = report.agentSlug
    ? await supabase.from("agents").select("id").eq("slug", report.agentSlug).maybeSingle()
    : { data: null };

  const { error } = await admin
    .from("outcome_reports")
    .update({
      result: report.result,
      amount: collectsHours ? null : report.amount,
      unit: collectsHours ? null : (playbook.outcome_unit ?? null),
      hours_saved: collectsHours ? report.hoursSaved : null,
      time_spent_bucket: report.timeSpentBucket ?? null,
      provider: report.provider ?? null,
      region: report.region ?? null,
      note: report.note ?? null,
      agent_id: agentRow?.id ?? null,
      // The report exists; editing it does not reset it to 'pending' moderation
      // unless the *new* amount is an outlier. Otherwise every typo fix would
      // silently remove a data point from the public counts for a day.
      status: isOutlier ? "pending" : "approved",
      is_outlier: isOutlier,
    })
    .eq("id", input.reportId)
    .eq("user_id", userId);

  if (error) {
    return { ok: false, error: "That change didn't save. Try again in a moment." };
  }

  revalidatePath(`/p/${playbook.slug}`);
  revalidatePath("/p/[slug]", "page");
  revalidatePath("/me");
  revalidatePath("/playbooks");

  return { ok: true, slug: playbook.slug as string };
}

/**
 * Delete a report, whenever you filed it.
 *
 * No window, deliberately: withdrawal is the reader's right at any time, and
 * the only cost is a hole in the numbers, which is the correct shape for a hole.
 *
 * The evidence files are removed by hand because they live in storage, and a
 * database cascade cannot reach them — a deleted report whose screenshot is
 * still sitting in a private bucket is data the reader asked us to forget.
 * The delete is attempted first so a storage failure can never leave a visible
 * report pointing at a missing file.
 */
export async function deleteReport(input: {
  reportId: string;
}): Promise<{ ok: boolean; error?: string; slug?: string }> {
  const supabase = await createClient();
  const { data: sessionData } = await supabase.auth.getUser();
  const userId = sessionData.user?.id;

  if (!userId) {
    return { ok: false, error: "Sign in to delete your report." };
  }

  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("outcome_reports")
    .select("id, user_id, playbook_id")
    .eq("id", input.reportId)
    .maybeSingle();

  if (!existing || existing.user_id !== userId) {
    return { ok: false, error: "That report isn't yours to delete." };
  }

  const { data: evidence } = await admin
    .from("report_evidence")
    .select("storage_path")
    .eq("report_id", input.reportId);

  const { error } = await admin
    .from("outcome_reports")
    .delete()
    .eq("id", input.reportId)
    .eq("user_id", userId);

  if (error) {
    return { ok: false, error: "That report didn't delete. Try again in a moment." };
  }

  // The rows are gone by now (on delete cascade), so the paths are read above
  // and removed here. Best-effort: the report is already withdrawn, which is
  // what the reader asked for, and failing the whole call over an orphaned
  // object would leave the report visible with the error on screen.
  for (const row of evidence ?? []) {
    const path = row.storage_path as string;
    if (path.startsWith(`${userId}/`)) {
      await admin.storage.from("evidence").remove([path]);
    }
  }

  const { data: playbook } = await supabase
    .from("playbooks")
    .select("slug")
    .eq("id", existing.playbook_id)
    .maybeSingle();

  const slug = playbook?.slug as string | undefined;

  if (slug) {
    revalidatePath(`/p/${slug}`);
  }
  revalidatePath("/p/[slug]", "page");
  revalidatePath("/me");
  revalidatePath("/playbooks");

  return { ok: true, slug };
}

/**
 * Replace the evidence file on a report inside the edit window.
 *
 * Separate from `editReport` because the file travels as a `File` and needs its
 * own signed upload, and separate because the two have genuinely different
 * rules: this one is allowed for 24 hours only.
 */
export async function replaceReportEvidence(input: {
  reportId: string;
  file: File;
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: sessionData } = await supabase.auth.getUser();
  const userId = sessionData.user?.id;

  if (!userId) {
    return { ok: false, error: "Sign in to change your evidence." };
  }

  const kind = evidenceKind(input.file);
  if (!kind) {
    return { ok: false, error: "Evidence has to be a screenshot or a PDF." };
  }

  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("outcome_reports")
    .select("id, user_id, created_at")
    .eq("id", input.reportId)
    .maybeSingle();

  if (!existing || existing.user_id !== userId) {
    return { ok: false, error: "That report isn't yours to change." };
  }

  if (nowMs() > new Date(existing.created_at).getTime() + REPORT_EDIT_WINDOW_HOURS * 3_600_000) {
    return {
      ok: false,
      error: `Evidence can be changed for ${REPORT_EDIT_WINDOW_HOURS} hours.`,
    };
  }

  const { data: previous } = await admin
    .from("report_evidence")
    .select("storage_path")
    .eq("report_id", input.reportId);

  const path = `${userId}/${input.reportId}/evidence.${evidenceExtension(kind, input.file.type)}`;

  const { data: signed, error: signError } = await admin.storage
    .from("evidence")
    .createSignedUploadUrl(path);

  if (signError || !signed) {
    return { ok: false, error: "That upload didn't start. Try again in a moment." };
  }

  const response = await fetch(signed.signedUrl, {
    method: "PUT",
    headers: { "Content-Type": input.file.type || "application/octet-stream", "x-upsert": "true" },
    body: await input.file.arrayBuffer(),
  });

  if (!response.ok) {
    return { ok: false, error: "That upload didn't finish. Try again in a moment." };
  }

  if ((previous ?? []).length > 0) {
    await admin.from("report_evidence").delete().eq("report_id", input.reportId);

    // Same path, upserted above, so the old object is already replaced. Only
    // paths with a *different* extension leave a file behind.
    for (const row of previous ?? []) {
      const oldPath = row.storage_path as string;
      if (oldPath !== path && oldPath.startsWith(`${userId}/`)) {
        await admin.storage.from("evidence").remove([oldPath]);
      }
    }
  }

  const { error: recordError } = await admin.from("report_evidence").insert({
    report_id: input.reportId,
    storage_path: path,
    kind,
    // A replacement starts its review again. Leaving `approved` on a file
    // nobody has looked at would let a screenshot be swapped under a decision
    // that was made about the previous one.
    review_status: "pending",
  });

  if (recordError) {
    return { ok: false, error: "That file didn't attach. Try again in a moment." };
  }

  return { ok: true };
}