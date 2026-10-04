"use server";

import { createClient } from "@/lib/supabase/server";
import { nowMs } from "@/server/clock";

/**
 * Schedule a "did it work?" reminder for a signed-in reader.
 *
 * Only for signed-in readers. `followups.user_id` is NOT NULL because a reminder
 * is an email, and there is nowhere to send one for an anonymous visitor. For
 * signed-out readers P7 shows a dismissible "Sign in to get a reminder?" card
 * instead — an offer, never a gate, because AGENTS.md forbids requiring sign-in
 * to copy a prompt or open an agent.
 *
 * Idempotent by way of a partial unique index rather than a check here
 * (`followups_one_open_per_user_playbook`): a read-then-write would race two
 * tabs, and the database is the only place that can settle it. A duplicate-key
 * violation is therefore an expected outcome, not an error, and is swallowed.
 *
 * Takes no input values. The prompt this reminder is about is not sent anywhere,
 * and neither is anything the reader typed into the try form.
 */
export async function createFollowup(input: {
  playbookId: string;
  tryEventId?: string | null;
}): Promise<{ created: boolean }> {
  if (!input.playbookId) {
    return { created: false };
  }

  const supabase = await createClient();

  const { data: sessionData } = await supabase.auth.getUser();
  const userId = sessionData.user?.id;

  // Anonymous. Nothing to schedule, and not a failure.
  if (!userId) {
    return { created: false };
  }

  const { data: playbook } = await supabase
    .from("playbooks")
    .select("followup_days")
    .eq("id", input.playbookId)
    .maybeSingle();

  if (!playbook) {
    return { created: false };
  }

  const days = playbook.followup_days ?? 7;

  const { error } = await supabase.from("followups").insert({
    user_id: userId,
    playbook_id: input.playbookId,
    try_event_id: input.tryEventId ?? null,
    // Computed from the server clock, never from a value the client sent — a
    // client that could choose `due_at` could choose to be reminded immediately,
    // repeatedly.
    due_at: new Date(nowMs() + days * 86_400_000).toISOString(),
  });

  // 23505 is unique_violation: an open follow-up already exists, which is the
  // state we wanted anyway.
  if (error && error.code !== "23505") {
    return { created: false };
  }

  return { created: true };
}