"use server";

import {
  coreFieldsSchema,
  validateContent,
  versionContentSchema,
  type CoreFields,
  type VersionContent,
} from "@/lib/admin/playbook-schema";
import { adminSession } from "@/server/admin/session";
import { writeAdminAction } from "@/server/admin/audit";
import { revalidatePublicPlaybook } from "@/server/admin/revalidate";

/**
 * Editing a playbook: the core fields in place, the content as a new version.
 *
 * ## Why publishing is not a separate action
 *
 * It is a field on the core edit, and that is a deliberate choice about where the
 * risk sits. A dedicated "publish" button next to a save button is two buttons
 * that look equally safe and are not, and the one that puts a page on the
 * internet is the one somebody presses while trying to fix a typo. In a form with
 * a status field, publishing is something you have to mean.
 *
 * ## Why the version is written before the content that belongs to it
 *
 * `playbook_versions` row, then its inputs and steps, then the pointer move to
 * `current_version_id`. The other order has a failure mode that matters: if the
 * content insert failed after the pointer moved, the playbook would be published
 * with a prompt that does not exist, and every reader who opened it in the window
 * before somebody noticed would have got nothing.
 *
 * This order's failure mode is an orphan version row with no content and no
 * pointer to it. That is visible in the version history as an empty entry, it is
 * recoverable, and nobody sees it.
 *
 * It is not a transaction, and cannot be one through PostgREST. The ordering is
 * the mitigation, and the reason for not reaching for `createAdminAction().rpc`
 * with a hand-written SQL function is that this is the only write in the admin
 * area that wants one — a schema that grows one function per feature is worse
 * than a documented ordering.
 */

export type PlaybookEditResult = { ok: true; warnings?: string[] } | { ok: false; error: string };

export async function updatePlaybookCore(input: unknown): Promise<PlaybookEditResult> {
  const session = await adminSession();
  if (!session.ok) return session;

  const parsed = coreFieldsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Those values are not valid." };
  }

  const fields: CoreFields = parsed.data;

  const { error } = await session.client
    .from("playbooks")
    .update({
      title: fields.title,
      promise: fields.promise,
      who_for: fields.whoFor ?? null,
      who_not_for: fields.whoNotFor ?? null,
      status: fields.status,
      preview_image_url: fields.previewImageUrl ?? null,
    })
    .eq("id", fields.id);

  if (error) {
    return { ok: false, error: `Could not save the playbook: ${error.message}` };
  }

  const { data: playbook } = await session.client
    .from("playbooks")
    .select("slug")
    .eq("id", fields.id)
    .maybeSingle();

  if (playbook) {
    revalidatePublicPlaybook(playbook.slug);
  }

  await writeAdminAction(session.client, session.adminId, {
    action: "playbook.update_core",
    target: playbook?.slug ?? fields.id,
    payload: { fields: { status: fields.status, title: fields.title } },
  });

  return { ok: true };
}

/**
 * Publish a new version of the prompt, inputs and steps.
 *
 * The old version is left in place. That is the point: a report cites the version
 * its reader was given, and the numbers behind a median stay explainable as long
 * as the thing they were measured against still exists.
 */
export async function createPlaybookVersion(input: unknown): Promise<PlaybookEditResult> {
  const session = await adminSession();
  if (!session.ok) return session;

  const parsed = versionContentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "That version is not valid." };
  }

  const content: VersionContent = parsed.data;

  const validation = validateContent({
    promptTemplate: content.promptTemplate,
    inputs: content.inputs,
  });

  if (!validation.ok) {
    return { ok: false, error: validation.error };
  }

  // The next number, read rather than counted: `count(*)` would be one fewer than
  // the right answer the moment a version insert and a delete raced.
  const { data: latest } = await session.client
    .from("playbook_versions")
    .select("version")
    .eq("playbook_id", content.playbookId)
    .order("version", { ascending: false })
    .limit(1);

  const versionNumber = (latest?.[0]?.version ?? 0) + 1;

  const { data: created, error: versionError } = await session.client
    .from("playbook_versions")
    .insert({
      playbook_id: content.playbookId,
      version: versionNumber,
      prompt_template: content.promptTemplate,
      changelog: content.changelog,
    })
    .select("id")
    .single();

  if (versionError || !created) {
    return { ok: false, error: `Could not create the version: ${versionError?.message ?? "unknown error"}` };
  }

  if (content.inputs.length > 0) {
    const { error: inputsError } = await session.client.from("playbook_inputs").insert(
      content.inputs.map((input, index) => ({
        version_id: created.id,
        key: input.key,
        label: input.label,
        type: input.type,
        required: input.required,
        help: input.help ?? null,
        // `null` rather than `{}` for an input that has no choices: the reader
        // treats options as a list, and an empty object stored where a list is
        // expected is a fact about the database rather than about the playbook.
        options: (Array.isArray(input.options) ? input.options : null) as never,
        sort: index,
      })),
    );

    if (inputsError) {
      return { ok: false, error: `Could not save the inputs: ${inputsError.message}` };
    }
  }

  if (content.steps.length > 0) {
    const { error: stepsError } = await session.client
      .from("playbook_steps")
      .insert(
        content.steps.map((step, index) => ({
          version_id: created.id,
          sort: index,
          body: step.body,
        })),
      );

    if (stepsError) {
      return { ok: false, error: `Could not save the steps: ${stepsError.message}` };
    }
  }

  // Last, and only now is the version reachable by a reader.
  const { error: pointerError } = await session.client
    .from("playbooks")
    .update({ current_version_id: created.id })
    .eq("id", content.playbookId);

  if (pointerError) {
    return { ok: false, error: `The version was saved but not made current: ${pointerError.message}` };
  }

  const { data: playbook } = await session.client
    .from("playbooks")
    .select("slug")
    .eq("id", content.playbookId)
    .maybeSingle();

  if (playbook) {
    revalidatePublicPlaybook(playbook.slug);
  }

  await writeAdminAction(session.client, session.adminId, {
    action: "playbook.new_version",
    target: playbook?.slug ?? content.playbookId,
    payload: { version: versionNumber },
  });

  return validation.ok ? { ok: true, warnings: validation.warnings } : { ok: true };
}

/**
 * "Mark verified now".
 *
 * One button for the founder who tested it themselves this morning. It is a claim
 * about a fact they were in a position to know, which is why it is a button here
 * and not a form field: the date cannot be typed, only set to now.
 */
export async function markPlaybookVerified(input: { playbookId: string }): Promise<PlaybookEditResult> {
  const session = await adminSession();
  if (!session.ok) return session;

  const { error } = await session.client
    .from("playbooks")
    .update({ last_verified_at: new Date().toISOString() })
    .eq("id", input.playbookId);

  if (error) {
    return { ok: false, error: `Could not mark it verified: ${error.message}` };
  }

  const { data: playbook } = await session.client
    .from("playbooks")
    .select("slug")
    .eq("id", input.playbookId)
    .maybeSingle();

  if (playbook) {
    revalidatePublicPlaybook(playbook.slug);
  }

  await writeAdminAction(session.client, session.adminId, {
    action: "playbook.mark_verified",
    target: playbook?.slug ?? input.playbookId,
  });

  return { ok: true };
}