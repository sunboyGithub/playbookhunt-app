"use server";

import { revalidatePath } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { reportSchema, REPORTS_PER_DAY } from "@/lib/report/schema";
import {
  AMOUNT_CAPS,
  evidenceExtension,
  evidenceKind,
  reportFieldsFrom,
  type OutcomeType,
} from "@/lib/report/shape";
import { nowMs } from "@/server/clock";

/**
 * File an outcome report.
 *
 * The one place a reader's own words and numbers are written to the database,
 * so each decision that follows is about what happens to data that will be
 * published.
 *
 * ## Order of operations, and why
 *
 * 1. **Validate.** Before any write, so a bad amount costs nothing.
 * 2. **Duplicate.** Checked, *and* enforced by a unique index. The check exists
 *    to produce the friendly message; the index exists to survive the race
 *    between two tabs. Only the index is load-bearing.
 * 3. **Rate limit.** Counted against the caller's own rows, server-side, with
 *    the service-role client — `outcome_reports.user_id` is deliberately
 *    ungranted to client roles, so the count cannot be done with the RLS client
 *    without widening a grant that exists to keep reporters anonymous.
 * 4. **Insert.** `status = 'approved'` unless the amount is above the cap, in
 *    which case `pending` + `is_outlier`. The moderation columns are revoked
 *    from client roles precisely so this decision is made here and nowhere else.
 * 5. **Evidence.** Only after the report exists, because the storage path
 *    contains the report id.
 * 6. **Follow-ups.** Completed, so a "did it work?" email does not arrive an
 *    hour after the answer.
 *
 * ## What is never sent
 *
 * The try form's inputs. A report says *whether it worked*, not *with what
 * numbers*, and the numbers someone typed into a negotiation prompt are the
 * most private thing on this site.
 */

export type SubmitReportResult =
  | {
      ok: true;
      reportId: string;
      slug: string;
      title: string;
      /** For the "Try next" suggestion. Null when there is nothing left to try. */
      nextPlaybook: { slug: string; title: string } | null;
      evidenceAttached: boolean;
    }
  | { ok: false; error: string; field?: string; /** Set when the fix is to edit, not to resubmit. */ editable?: boolean }
  | { ok: false; error: string; field?: string; signInRequired: true };

export async function submitReport(input: unknown): Promise<SubmitReportResult> {
  const supabase = await createClient();
  const { data: sessionData } = await supabase.auth.getUser();
  const userId = sessionData.user?.id;

  if (!userId) {
    return {
      ok: false,
      error: "Sign in to report your result.",
      field: "result",
      signInRequired: true,
    };
  }

  // The playbook is re-read here rather than trusted from the request, because
  // every decision below depends on it: which column the amount goes in, what
  // the cap is, whether a provider select exists at all.
  const playbookId = typeof input === "object" && input !== null ? (input as Record<string, unknown>).playbookId : null;
  if (typeof playbookId !== "string") {
    return { ok: false, error: "That report is missing a playbook." };
  }

  const { data: playbook } = await supabase
    .from("playbooks")
    .select("id, slug, title, status, current_version_id, outcome_type, outcome_unit, report_fields")
    .eq("id", playbookId)
    .maybeSingle();

  if (!playbook || playbook.status !== "published") {
    return { ok: false, error: "That playbook isn't available." };
  }

  const versionId =
    typeof input === "object" && input !== null
      ? (input as Record<string, unknown>).versionId
      : null;

  // A report is filed against the *current* version, not whatever the browser
  // had when it opened the form. Filing against a stale one would attach a
  // result to a prompt the reader never saw, and the version is the unit the
  // "one report per version" rule and the unique index are both built on.
  const resolvedVersionId = (playbook.current_version_id ?? versionId) as string | null;

  if (!resolvedVersionId) {
    return { ok: false, error: "That playbook has no published version to report on." };
  }

  const outcomeType = (playbook.outcome_type ?? null) as OutcomeType | null;
  const extraFields = reportFieldsFrom(playbook.report_fields);
  const providerOptions = extraFields.find((field) => field.key === "provider")?.options ?? [];
  const regionOptions = extraFields.find((field) => field.key === "region")?.options ?? [];

  const parsed = reportSchema(outcomeType, providerOptions, regionOptions).safeParse({
    ...(typeof input === "object" && input !== null ? input : {}),
    playbookId,
    versionId: resolvedVersionId,
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
  const admin = createAdminClient();

  /* ---------------------------------------------------------------------- */
  /* Rate limit                                                              */
  /* ---------------------------------------------------------------------- */

  const since = new Date(nowMs() - 86_400_000).toISOString();
  const { count } = await admin
    .from("outcome_reports")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", since);

  if ((count ?? 0) >= REPORTS_PER_DAY) {
    return {
      ok: false,
      error: `That's ${REPORTS_PER_DAY} reports today. Try again tomorrow — this limit is per person, and it's the only thing stopping a playbook's numbers from being written by one person.`,
    };
  }

  /* ---------------------------------------------------------------------- */
  /* Amount and outlier                                                      */
  /* ---------------------------------------------------------------------- */

  const collectsHours = outcomeType === "time_hours";
  const cap = outcomeType ? AMOUNT_CAPS[outcomeType] : 0;
  const value = collectsHours ? report.hoursSaved : report.amount;
  const isOutlier = value !== null && cap > 0 && value > cap;

  /* ---------------------------------------------------------------------- */
  /* Insert                                                                  */
  /* ---------------------------------------------------------------------- */

  const { data: agentRow } = report.agentSlug
    ? await supabase.from("agents").select("id").eq("slug", report.agentSlug).maybeSingle()
    : { data: null };

  const { data: inserted, error: insertError } = await admin
    .from("outcome_reports")
    .insert({
      playbook_id: playbook.id,
      version_id: resolvedVersionId,
      user_id: userId,
      agent_id: agentRow?.id ?? null,
      result: report.result,
      amount: collectsHours ? null : report.amount,
      unit: collectsHours ? null : (playbook.outcome_unit ?? null),
      hours_saved: collectsHours ? report.hoursSaved : null,
      time_spent_bucket: report.timeSpentBucket ?? null,
      provider: report.provider ?? null,
      region: report.region ?? null,
      note: report.note ?? null,
      referral_code: report.referralCode ?? null,
      // Set by the *service* client, which bypasses RLS. The column grants stop
      // a reporter from doing this themselves; this is the only place it can
      // legitimately happen.
      status: isOutlier ? "pending" : "approved",
      is_outlier: isOutlier,
    })
    .select("id")
    .single();

  if (insertError) {
    // 23505: the unique (user_id, version_id) index. The friendly half of the
    // rule — the index is what actually enforces it.
    if (insertError.code === "23505") {
      return {
        ok: false,
        editable: true,
        error:
          "You've already reported on this version of the playbook. You can change what you said for the next 24 hours.",
        field: "result",
      };
    }

    // 23514: a check constraint — the time bucket, the result enum, or the
    // referral code's shape. The schema should have caught it first, so this
    // means the two disagree and the database is the one to believe.
    return {
      ok: false,
      error: "That report didn't save. Check the form and try again.",
    };
  }

  const reportId = inserted.id as string;

  /* ---------------------------------------------------------------------- */
  /* Evidence                                                                */
  /* ---------------------------------------------------------------------- */

  let evidenceAttached = false;

  if (report.evidence) {
    const kind = evidenceKind(report.evidence);
    if (kind) {
      const uploaded = await uploadEvidence(admin, {
        userId,
        reportId,
        file: report.evidence,
        kind,
      });

      evidenceAttached = uploaded;
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Follow-ups and revalidation                                              */
  /* ---------------------------------------------------------------------- */

  await admin
    .from("followups")
    .update({ completed_at: new Date(nowMs()).toISOString() })
    .eq("user_id", userId)
    .eq("playbook_id", playbook.id)
    .is("completed_at", null);

  // P9 writes the aggregate rows. Until that job exists there is nothing to
  // recompute here, so this revalidation refreshes the parts of the page that
  // do read the report — the list of reports from others, and the count of
  // reports — and the evidence tiles stay at whatever the last job wrote. That
  // gap is P9's, and it is called out rather than papered over.
  revalidatePath(`/p/${playbook.slug}`);
  revalidatePath("/p/[slug]", "page");
  revalidatePath("/me");
  revalidatePath("/playbooks");

  const nextPlaybook = await nextSuggestion(supabase, playbook.id);

  return {
    ok: true,
    reportId,
    slug: playbook.slug as string,
    title: playbook.title as string,
    nextPlaybook,
    evidenceAttached,
  };
}

/* -------------------------------------------------------------------------- */
/* Evidence                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Put the file in the private bucket and record it against the report.
 *
 * Uses a *signed upload URL* rather than a direct insert for the reason the
 * brief gives: the URL carries its own authorisation and can be handed to
 * another service without handing over the service-role key. It is minted here,
 * at submit time, and used immediately — it never reaches the browser.
 *
 * The path is `<user_id>/<report_id>/<name>` because the storage policies read
 * the first folder as the owner. A different layout would let those policies
 * evaluate to false and quietly make every evidence file unreadable, which is
 * indistinguishable from the upload having failed.
 *
 * Returns false rather than throwing: a report with no evidence is still a
 * report, and failing the whole submission over a file would cost the reader
 * their one required answer.
 */
async function uploadEvidence(
  admin: ReturnType<typeof createAdminClient>,
  { userId, reportId, file, kind }: { userId: string; reportId: string; file: File; kind: "image" | "pdf" },
): Promise<boolean> {
  const extension = evidenceExtension(kind, file.type);
  const path = `${userId}/${reportId}/evidence.${extension}`;

  const { data: signed, error: signError } = await admin.storage
    .from("evidence")
    .createSignedUploadUrl(path);

  if (signError || !signed) {
    return false;
  }

  const response = await fetch(signed.signedUrl, {
    method: "PUT",
    headers: {
      "Content-Type": file.type || "application/octet-stream",
      "x-upsert": "true",
    },
    body: await file.arrayBuffer(),
  });

  if (!response.ok) {
    return false;
  }

  const { error: recordError } = await admin.from("report_evidence").insert({
    report_id: reportId,
    storage_path: path,
    kind,
  });

  return !recordError;
}

/* -------------------------------------------------------------------------- */
/* "Try next"                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * One more playbook in the same category.
 *
 * A report is the moment a reader is most willing to try something else, so
 * the success screen offers exactly one — not a grid, which would turn the end
 * of a task into a browse. Null when the category has nothing else in it,
 * because an empty "Try next" slot is worse than no slot.
 */
async function nextSuggestion(
  supabase: Awaited<ReturnType<typeof createClient>>,
  excludeId: string,
): Promise<{ slug: string; title: string } | null> {
  const { data: current } = await supabase
    .from("playbooks")
    .select("category_id")
    .eq("id", excludeId)
    .maybeSingle();

  if (!current) return null;

  const { data } = await supabase
    .from("playbooks")
    .select("slug, title")
    .eq("status", "published")
    .eq("category_id", current.category_id)
    .neq("id", excludeId)
    .order("title")
    .limit(1)
    .maybeSingle();

  return data ? { slug: String(data.slug), title: String(data.title) } : null;
}