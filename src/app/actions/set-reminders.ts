"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

/**
 * Turn the one-off "did it work?" reminder emails on or off.
 *
 * Deliberately the only preference here. Every preference costs a settings page
 * to maintain and a person to reason about before they trust the site with
 * anything else, and this one exists because the brief asks for it and because
 * an email you cannot switch off is an email you eventually route around the
 * whole domain for.
 *
 * There is no frequency, no digest and no "only for playbooks I saved" — one
 * switch, because the thing it controls is already one email per try.
 */
export async function setReminders(enabled: boolean): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const { data: sessionData } = await supabase.auth.getUser();
  const userId = sessionData.user?.id;

  if (!userId) {
    return { ok: false };
  }

  // `reminders_enabled` is inside the column-level grant from P8's migration,
  // so this write cannot reach `role` even though the table grant would allow
  // the UPDATE in principle.
  const { error } = await supabase
    .from("profiles")
    .update({ reminders_enabled: enabled })
    .eq("id", userId);

  if (error) {
    return { ok: false };
  }

  revalidatePath("/me");
  return { ok: true };
}