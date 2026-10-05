"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

import { draftPayloadSchema, errorsFromIssues, submissionSchema, type DraftErrors } from "@/lib/create/schema";
import { materialize, OUTCOME_OPTIONS } from "@/lib/create/shape";
import { firstError } from "@/lib/create/schema";
import type { Json } from "@/lib/database.types";

/**
 * Saving a draft and submitting it for review.
 *
 * ## Two actions, because "Save draft" and "Submit for review" mean different things
 *
 * The brief requires a draft to be savable at any point, including after nothing
 * has been filled in, and it requires a submission to satisfy rules a draft has no
 * business satisfying. So they are separate actions against separate schemas —
 * `draftPayloadSchema` accepts an empty form, `submissionSchema` does not — rather
 * than one action with a mode flag that every rule would have to be guarded by.
 *
 * ## Why submitting uses the service-role client
 *
 * `submit_playbook` is granted to `service_role` only, because it is the only
 * writer of `playbooks.author_id` and of `playbooks.status` and a reader should
 * not be able to set either. The call therefore cannot go through the reader's
 * RLS-blessed client, and the usual worry — a service-role call that trusts the
 * request — is answered by the function itself rather than by the transport: it
 * re-reads the draft and refuses an id that is not `p_author_id`. That is a
 * staleness check on top of a transport boundary, and both are load-bearing.
 *
 * `p_author_id` comes from a verified session, never from the payload. A caller
 * that passed its own author id could submit as anybody.
 *
 * Saving, by contrast, uses the reader's client, so RLS is what enforces that a
 * draft belongs to whoever is saving it.
 */

export type SaveDraftResult =
  | { ok: true; draftId: string; revision: number }
  | {
      ok: false;
      error: string;
      field?: string;
      signInRequired?: true;
      /** Somebody else saved first. The client's copy is stale, not wrong. */
      conflict?: true;
    };

export type SubmitPlaybookResult =
  | { ok: true; playbookId: string; slug: string; version: number; draftId: string }
  | {
      ok: false;
      error: string;
      /** The one field to focus, in the order the form is laid out. */
      field?: string;
      /** Every field that is wrong, keyed the way the form reads them. */
      errors?: DraftErrors;
      signInRequired?: true;
    };

/**
 * Cast a validated draft to the jsonb the column wants.
 *
 * `Json` is a recursive union, so TypeScript cannot see that an object type with
 * no index signature is assignable to it — the mismatch is structural, not real,
 * and the cast is what says so at the one place where the value crosses into
 * jsonb. The shape has already been through `draftPayloadSchema`, so this is not
 * a way of smuggling unchecked data in.
 */
function asJson(value: unknown): NonNullable<Json> {
  return value as NonNullable<Json>;
}

/** One draft, as the form holds it. */
function payloadOf(input: unknown): unknown {
  return typeof input === "object" && input !== null ? input : {};
}

/**
 * Save an incomplete draft.
 *
 * ## The revision is not bookkeeping
 *
 * The brief asks to "protect against stale concurrent edits", and the failure
 * without it is specific: the form autosaves on a timer, a save is in flight, the
 * creator types more and the next save goes out, and then the first one lands and
 * silently overwrites the newer text. Nothing errors — the draft is just older
 * than the creator last saw it, and they find out by reloading.
 *
 * So every save carries the revision it was loaded at and the update is
 * conditional on it. A save that arrives after somebody else's reports a
 * conflict, which the form shows, rather than quietly winning a race it lost.
 */
export async function saveDraft(input: {
  draftId?: string | null;
  revision?: number | null;
  content: unknown;
}): Promise<SaveDraftResult> {
  const supabase = await createClient();
  const { data: sessionData } = await supabase.auth.getUser();
  const userId = sessionData.user?.id;

  if (!userId) {
    return { ok: false, error: "Sign in to save your draft.", signInRequired: true };
  }

  const parsed = draftPayloadSchema.safeParse(input.content);

  if (!parsed.success) {
    const errors = errorsFromIssues(parsed.error);
    // `firstError` returns the *key* of the first bad field — it exists to drive
    // focus, and using it as the sentence would have told the creator "title" or,
    // for a payload with an unexpected field, "". The message is looked up by that
    // key, which is what the submit path below already did.
    const field = firstError(errors);

    return {
      ok: false,
      error: (field === null ? undefined : errors[field]) ?? "Check the form and try again.",
      field: field ?? undefined,
    };
  }

  const content = parsed.data;
  const draftId = input.draftId ?? null;

  if (!draftId) {
    const { data, error } = await supabase
      .from("playbook_drafts")
      .insert({ author_id: userId, content: asJson(content) })
      .select("id, revision")
      .single();

    if (error || !data) {
      return { ok: false, error: "That draft didn't save. Try again in a moment." };
    }

    return { ok: true, draftId: data.id, revision: data.revision };
  }

  const expectedRevision = input.revision ?? null;

  // `.select()` with no `single()`: a stale save updates *zero* rows, and asking
  // for one row would turn that into an error indistinguishable from a real
  // failure. The array length is what tells the two apart.
  const { data, error } = await supabase
    .from("playbook_drafts")
    .update({
      content: asJson(content),
      revision: (expectedRevision ?? 0) + 1,
    })
    .eq("id", draftId)
    .eq("author_id", userId)
    .eq("revision", expectedRevision ?? 1)
    .select("id, revision");

  if (error) {
    return { ok: false, error: "That draft didn't save. Try again in a moment." };
  }

  if (data.length === 0) {
    return {
      ok: false,
      error: "This draft was changed somewhere else. Reload it to keep that version.",
      conflict: true,
    };
  }

  return { ok: true, draftId: data[0]!.id, revision: data[0]!.revision };
}

/**
 * Turn a validated draft into the published shape and submit it for review.
 *
 * The materialization happens here, in TypeScript, and the SQL function stores
 * what it is handed. That split is deliberate — the input keys, the step defaults
 * and the placeholder checks are all decided in `materialize()` and
 * `submissionSchema`, and reimplementing any of them in plpgsql would give the two
 * copies a chance to disagree, which would show up as an input count that does not
 * match the placeholders in the prompt.
 */
export async function submitPlaybook(input: {
  draftId?: string | null;
  content: unknown;
}): Promise<SubmitPlaybookResult> {
  const supabase = await createClient();
  const { data: sessionData } = await supabase.auth.getUser();
  const userId = sessionData.user?.id;

  if (!userId) {
    return { ok: false, error: "Sign in to submit your playbook.", signInRequired: true };
  }

  const parsed = submissionSchema.safeParse(payloadOf(input.content));

  if (!parsed.success) {
    const errors = errorsFromIssues(parsed.error);
    const field = firstError(errors);

    return {
      ok: false,
      error: errors[field ?? ""] ?? "Check the form and try again.",
      field: field ?? undefined,
      errors,
    };
  }

  const draft = parsed.data;
  const materialized = materialize(draft);

  // `binary` and the money types carry a unit on the public page
  // ("$40/mo saved"), and the outcome unit is what says which one. Derived from
  // the same table the form renders, so the two cannot disagree.
  const unit = OUTCOME_OPTIONS.find((option) => option.value === draft.outcomeType)?.unit ?? null;

  const sourceUrl = draft.sourceUrl.trim();

  if (sourceUrl !== "" && !/^https?:\/\/\S+$/i.test(sourceUrl)) {
    return {
      ok: false,
      error: "Use a full link starting with http:// or https://.",
      field: "sourceUrl",
      errors: { sourceUrl: "Use a full link starting with http:// or https://." },
    };
  }

  const admin = createAdminClient();

  const { data, error } = await admin.rpc("submit_playbook", {
    p_author_id: userId,
    // A real null, behind a cast, rather than the `""` that looks like it would
    // avoid one.
    //
    // The generated types cannot express "nullable with no default" — every
    // non-default parameter comes out required — so `null` needs
    // `as unknown as string`. The alternative is an empty string, which reads
    // better here and does not work: the parameter is `uuid`, so Postgres casts
    // the literal *before* the function body runs and `''` is not a uuid. The
    // function's `nullif(p_draft_id::text, '')` guard is defensive, not the
    // mechanism. This was found by the pgTAP round trip, not by reading.
    p_draft_id: (input.draftId ?? null) as unknown as string,
    p_content: asJson(draft),
    p_inputs: asJson(materialized.inputs),
    p_steps: materialized.steps,
    // Optional because it has a SQL default of null, so omitting it says the same
    // thing — which is what `null` would mean, and needs no cast to express.
    p_outcome_unit: unit ?? undefined,
    p_source: sourceUrl === "" ? null : { url: sourceUrl },
  });

  if (error) {
    // The function refuses a draft that is not the caller's, and the lock trigger
    // refuses a draft that has already been submitted. Both are answers to "you
    // cannot do that right now", and neither is worth a stack trace.
    return { ok: false, error: "That submission didn't go through. Try again in a moment." };
  }

  const row = (data ?? [])[0];

  if (!row) {
    return { ok: false, error: "That submission didn't go through. Try again in a moment." };
  }

  return {
    ok: true,
    playbookId: row.playbook_id,
    slug: row.slug,
    version: row.version,
    draftId: row.draft_id,
  };
}

/**
 * The author's own drafts, for "My submissions" in `/me` and for reopening `/create`.
 *
 * Read with the reader's own client, so RLS decides what comes back: this cannot
 * be pointed at somebody else's account by changing an argument, because there is
 * no argument. The submission is joined through the draft's `playbook_id` rather
 * than by author, so the two cannot disagree about who owns a submission.
 *
 * Also capped at 50: this backs a "My submissions" tab, not a paginated archive,
 * and a creator with more than 50 drafts has a different problem than a slow page.
 */
export async function listMyDrafts(): Promise<{
  drafts: {
    draftId: string;
    revision: number;
    playbookId: string | null;
    slug: string | null;
    title: string;
    reviewStatus: string | null;
    reviewerNote: string | null;
    updatedAt: string;
  }[];
}> {
  const supabase = await createClient();
  const { data: sessionData } = await supabase.auth.getUser();

  if (!sessionData.user?.id) {
    return { drafts: [] };
  }

  // One template literal, not a concatenation and not a module constant. Supabase's
  // generated types parse the select string at the type level, and anything that
  // widens to `string` first collapses every column into `GenericStringError`.
  //
  // The submission is reached *through* `playbooks`, because there is no foreign key
  // from `playbook_drafts` to `playbook_submissions` — the draft points at a
  // playbook, and the playbook is what owns a submission. Joining the short way
  // round is a relation PostgREST cannot find, and the honest fix is the long join
  // rather than a second round trip for a table this small. Both embeds are left
  // joins: a draft that has never been submitted has no playbook, and dropping
  // those rows would hide the creator's work in progress.
  const { data, error } = await supabase
    .from("playbook_drafts")
    .select(
      `id, revision, playbook_id, content, updated_at,
       playbook:playbooks(slug, title, submission:playbook_submissions(status, reviewer_note))`,
    )
    .order("updated_at", { ascending: false })
    .limit(50);

  if (error) {
    return { drafts: [] };
  }

  const rows = data ?? [];

  return {
    drafts: rows.map((row) => {
      const content = (row.content ?? {}) as { title?: string };
      const joined = row.playbook;

      return {
        draftId: row.id,
        revision: row.revision,
        playbookId: row.playbook_id,
        slug: joined?.slug ?? null,
        title: joined?.title || content.title?.trim() || "",
        reviewStatus: joined?.submission?.status ?? null,
        reviewerNote: joined?.submission?.reviewer_note ?? null,
        updatedAt: row.updated_at,
      };
    }),
  };
}