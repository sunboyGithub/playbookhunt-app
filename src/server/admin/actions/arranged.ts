"use server";

import { z } from "zod";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import { normalizeOrder } from "@/lib/admin/ordering";
import { adminSession } from "@/server/admin/session";
import { writeAdminAction } from "@/server/admin/audit";
import { revalidatePath } from "next/cache";

/**
 * Starter kits and Popular Use Cases: the two hand-arranged lists.
 *
 * ## Why one file for both
 *
 * Same two-table shape, same ordering semantics, same decisions — the earlier
 * reason in `queries/arranged.ts` applies to the writes as much as the reads. The
 * only things that differ are a use case's gradient and the fact that a starter
 * kit can be featured, so those are the two fields that are threaded through and
 * everything else is written once.
 *
 * ## Why reordering rewrites the whole list
 *
 * The submitted order is checked against what is stored — same set, no duplicates
 * — and then written as an explicit `sort` per row. A partial "move this one up by
 * one" would need a transaction to avoid two rows briefly sharing a sort value,
 * and `playbook_steps` already has a unique constraint on exactly that shape to
 * show how it goes wrong. Rewriting the list is idempotent, re-runnable, and it
 * cannot half-apply.
 */

export type ArrangeResult = { ok: true } | { ok: false; error: string };

/** The table client. These actions never reach for auth or storage. */
type TableClient = Pick<SupabaseClient<Database>, "from">;

const slug = z
  .string()
  .trim()
  .min(2)
  .max(60)
  .regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers and dashes.");

const title = z.string().trim().min(2).max(120);
const blurb = z
  .string()
  .trim()
  .max(400)
  .transform((value) => (value.length === 0 ? null : value))
  .nullish();

const colour = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #E8EFFC.");

const collectionFields = z.object({
  title,
  slug,
  blurb,
  illustrationUrl: z
    .string()
    .trim()
    .max(500)
    .transform((value) => (value.length === 0 ? null : value))
    .nullish()
    .refine(
      (value) => value === null || value === undefined || /^https?:\/\//.test(value),
      "Use a full http or https URL.",
    ),
  isFeatured: z.boolean(),
  sort: z.number().int(),
});

const useCaseFields = z.object({
  title,
  slug,
  description: blurb,
  gradientFrom: colour,
  gradientTo: colour,
  sort: z.number().int(),
});

export async function saveCollection(input: {
  id: string | null;
  fields: unknown;
}): Promise<ArrangeResult> {
  const session = await adminSession();
  if (!session.ok) return session;

  const parsed = collectionFields.safeParse(input.fields);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Those values are not valid." };
  }

  const fields = parsed.data;
  const row = {
    title: fields.title,
    slug: fields.slug,
    blurb: fields.blurb ?? null,
    illustration_url: fields.illustrationUrl ?? null,
    is_featured: fields.isFeatured,
    sort: fields.sort,
  };

  const { error } = input.id
    ? await session.client.from("collections").update(row).eq("id", input.id)
    : await session.client.from("collections").insert(row);

  if (error) {
    // The most likely cause by a wide margin is the slug: it is unique, it is
    // typed by hand, and the message below is the one that tells somebody why.
    return {
      ok: false,
      error: error.code === "23505" ? "That address is already taken by another kit." : error.message,
    };
  }

  revalidatePath("/kits");
  revalidatePath("/");

  await writeAdminAction(session.client, session.adminId, {
    action: input.id ? "collection.update" : "collection.create",
    target: fields.slug,
  });

  return { ok: true };
}

export async function saveUseCase(input: {
  id: string | null;
  fields: unknown;
}): Promise<ArrangeResult> {
  const session = await adminSession();
  if (!session.ok) return session;

  const parsed = useCaseFields.safeParse(input.fields);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Those values are not valid." };
  }

  const fields = parsed.data;
  const row = {
    title: fields.title,
    slug: fields.slug,
    description: fields.description ?? null,
    gradient_from: fields.gradientFrom,
    gradient_to: fields.gradientTo,
    sort: fields.sort,
  };

  const { error } = input.id
    ? await session.client.from("use_cases").update(row).eq("id", input.id)
    : await session.client.from("use_cases").insert(row);

  if (error) {
    return {
      ok: false,
      error: error.code === "23505" ? "That address is already taken." : error.message,
    };
  }

  revalidatePath("/use-cases");
  revalidatePath("/");

  await writeAdminAction(session.client, session.adminId, {
    action: input.id ? "use_case.update" : "use_case.create",
    target: fields.slug,
  });

  return { ok: true };
}

/** Which arranged list a reorder is for, named by the column that identifies it. */
type Items = { parent: "collection_id" | "use_case_id" };

/**
 * Write an order back.
 *
 * `normalizeOrder` refusing a stale or partial list is what stops this from
 * quietly removing a playbook from a public page — see that function for why
 * neither "drop the extras" nor "add the missing" is an acceptable repair.
 *
 * The upsert is on the pair primary key, so no row is deleted: since the
 * submitted order is a permutation of what exists, every row is present and only
 * its `sort` changes.
 *
 * Dispatched rather than parameterised on the table name, because a
 * `.from(tableName)` built from a union cannot be typed and the cast that would
 * fix it would be a cast on the *write* — the one place where a wrong column name
 * silently does the wrong thing to a public page.
 */
async function writeOrder(
  client: TableClient,
  items: Items,
  parentId: string,
  submitted: string[],
): Promise<ArrangeResult> {
  const collection = items.parent === "collection_id";

  const { data: current, error: readError } = collection
    ? await client.from("collection_items").select("playbook_id").eq("collection_id", parentId)
    : await client.from("use_case_items").select("playbook_id").eq("use_case_id", parentId);

  if (readError) {
    return { ok: false, error: `Could not read the list: ${readError.message}` };
  }

  const result = normalizeOrder(
    submitted,
    (current ?? []).map((row) => row.playbook_id),
  );

  if (!result.ok) {
    return {
      ok: false,
      error:
        result.error === "unknown-item"
          ? "That list contains something that is no longer in it. Reload and try again."
          : "That list is not the list as it stands. Reload and try again.",
    };
  }

  const { error } = collection
    ? await client
        .from("collection_items")
        .upsert(
          result.order.map((playbookId, index) => ({
            collection_id: parentId,
            playbook_id: playbookId,
            sort: index,
          })),
        )
    : await client
        .from("use_case_items")
        .upsert(
          result.order.map((playbookId, index) => ({
            use_case_id: parentId,
            playbook_id: playbookId,
            sort: index,
          })),
        );

  if (error) {
    return { ok: false, error: `Could not save the order: ${error.message}` };
  }

  return { ok: true };
}

export async function reorderCollectionItems(input: {
  collectionId: string;
  order: string[];
}): Promise<ArrangeResult> {
  const session = await adminSession();
  if (!session.ok) return session;

  const result = await writeOrder(
    session.client,
    { parent: "collection_id" },
    input.collectionId,
    input.order,
  );

  if (result.ok) {
    revalidatePath("/kits");
    revalidatePath("/");
    await writeAdminAction(session.client, session.adminId, {
      action: "collection.reorder",
      target: input.collectionId,
      payload: { order: input.order },
    });
  }

  return result;
}

export async function reorderUseCaseItems(input: {
  useCaseId: string;
  order: string[];
}): Promise<ArrangeResult> {
  const session = await adminSession();
  if (!session.ok) return session;

  const result = await writeOrder(
    session.client,
    { parent: "use_case_id" },
    input.useCaseId,
    input.order,
  );

  if (result.ok) {
    revalidatePath("/use-cases");
    revalidatePath("/");
    await writeAdminAction(session.client, session.adminId, {
      action: "use_case.reorder",
      target: input.useCaseId,
      payload: { order: input.order },
    });
  }

  return result;
}

/**
 * Add or remove one playbook from an arranged list.
 *
 * A separate action from the reorder because adding is *not* a reorder: it changes
 * which rows exist, so the submitted list is a permutation plus one, and running
 * it through `normalizeOrder` would refuse every add. New items go at the end of
 * the stored order rather than wherever the caller happened to be looking — which
 * is then fixed by the reorder controls, which is what they are for.
 */
export async function setArrangedItem(input: {
  table: "collection" | "use_case";
  parentId: string;
  playbookId: string;
  present: boolean;
}): Promise<ArrangeResult> {
  const session = await adminSession();
  if (!session.ok) return session;

  const collection = input.table === "collection";

  const error = await (async () => {
    if (input.present) {
      const { count } = collection
        ? await session.client
            .from("collection_items")
            .select("playbook_id", { count: "exact", head: true })
            .eq("collection_id", input.parentId)
        : await session.client
            .from("use_case_items")
            .select("playbook_id", { count: "exact", head: true })
            .eq("use_case_id", input.parentId);

      return collection
        ? (
            await session.client.from("collection_items").insert({
              collection_id: input.parentId,
              playbook_id: input.playbookId,
              sort: count ?? 0,
            })
          ).error
        : (
            await session.client.from("use_case_items").insert({
              use_case_id: input.parentId,
              playbook_id: input.playbookId,
              sort: count ?? 0,
            })
          ).error;
    }

    return collection
      ? (
          await session.client
            .from("collection_items")
            .delete()
            .eq("collection_id", input.parentId)
            .eq("playbook_id", input.playbookId)
        ).error
      : (
          await session.client
            .from("use_case_items")
            .delete()
            .eq("use_case_id", input.parentId)
            .eq("playbook_id", input.playbookId)
        ).error;
  })();

  if (error) {
    return { ok: false, error: `Could not ${input.present ? "add it" : "remove it"}: ${error.message}` };
  }

  revalidatePath(collection ? "/kits" : "/use-cases");
  revalidatePath("/");

  await writeAdminAction(session.client, session.adminId, {
    action: `${input.table}.${input.present ? "add_item" : "remove_item"}`,
    target: input.parentId,
    payload: { playbookId: input.playbookId },
  });

  return { ok: true };
}