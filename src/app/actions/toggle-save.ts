"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

/**
 * Save or unsave a playbook.
 *
 * Idempotent on intent rather than on state: the caller says which way it wants
 * to go, because a toggle-by-read has two windows of failure (two tabs, one
 * click each) and this is the operation where they cost something — a reader
 * clicks ★, the button stays unlit, and they click again.
 *
 * `ok: false` with no error is the anonymous case, and it is deliberately not
 * an error string. The caller already knows it is signed out — it opened the
 * sign-in panel instead of calling this — so an error would only ever be
 * rendered into a state the reader cannot reach.
 */
export async function toggleSave(input: {
  playbookId: string;
  saved: boolean;
}): Promise<{ ok: boolean; saved: boolean }> {
  const playbookId = input.playbookId;
  if (!playbookId) {
    return { ok: false, saved: false };
  }

  const supabase = await createClient();
  const { data: sessionData } = await supabase.auth.getUser();
  const userId = sessionData.user?.id;

  if (!userId) {
    return { ok: false, saved: input.saved };
  }

  if (input.saved) {
    const { error } = await supabase
      .from("saves")
      .delete()
      .eq("user_id", userId)
      .eq("playbook_id", playbookId);

    if (error) {
      return { ok: false, saved: true };
    }
  } else {
    const { error } = await supabase
      .from("saves")
      .insert({ user_id: userId, playbook_id: playbookId });

    // 23505 is unique_violation: it was already saved, which is the state that
    // was asked for. Two tabs racing to star the same playbook is a success.
    if (error && error.code !== "23505") {
      return { ok: false, saved: false };
    }
  }

  const saved = input.saved ? false : true;

  // Both pages render the star, so both have to be revalidated. `/me` is the
  // list the reader is about to go and look at.
  revalidatePath("/me");
  revalidatePath("/p/[slug]", "page");

  return { ok: true, saved };
}

/** Whether the reader has saved these playbooks. Server-side, for the page. */
export async function listSavedPlaybookIds(playbookIds: string[]): Promise<string[]> {
  if (playbookIds.length === 0) {
    return [];
  }

  const supabase = await createClient();
  const { data: sessionData } = await supabase.auth.getUser();
  if (!sessionData.user) {
    return [];
  }

  const { data } = await supabase
    .from("saves")
    .select("playbook_id")
    .eq("user_id", sessionData.user.id)
    .in("playbook_id", playbookIds);

  return (data ?? []).map((row) => row.playbook_id as string);
}