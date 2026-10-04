"use server";

import { z } from "zod";

import { track } from "@/lib/analytics";
import { createClient } from "@/lib/supabase/server";

/**
 * The "tell us what you wanted" form behind every empty search result.
 *
 * This is the last of the three never-dead-end layers: text search, then the
 * category fallback, then this. A reader whose search found nothing is not
 * finished — they are one form away from asking for the thing they wanted, and
 * that request is the queue for the next playbook.
 *
 * No sign-in. Asking for a playbook costs a sentence, and requiring an account
 * would cost the whole submission.
 */

const RequestSchema = z.object({
  query: z.string().trim().min(3, "Tell us a bit more about the task.").max(300),
  email: z
    .string()
    .trim()
    // Optional, per the brief. `""` is what an untouched optional input posts,
    // so a blank is absent rather than invalid.
    .refine((value) => value === "" || z.string().email().safeParse(value).success, {
      message: "That email does not look right.",
    })
    .transform((value) => (value === "" ? null : value)),
  /**
   * Honeypot. A real reader never sees this field — it is hidden from sighted
   * users, and `aria-hidden` plus `tabIndex={-1}` keeps it away from screen
   * readers and the keyboard too, so an assistive technology cannot fail a
   * person for being thorough.
   */
  company: z.string().max(0).optional(),
});

export type RequestState =
  | { status: "idle" }
  | { status: "success" }
  | { status: "error"; message: string };

export async function requestPlaybook(
  _prev: RequestState,
  formData: FormData,
): Promise<RequestState> {
  const parsed = RequestSchema.safeParse({
    query: formData.get("query"),
    email: formData.get("email") ?? "",
    company: formData.get("company") ?? "",
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Something was wrong with that.",
    };
  }

  // Honeypot filled means a bot. Reported as success on purpose: a bot that
  // learns from the error message will try again, and the reader never sees
  // this path.
  if (parsed.data.company) {
    return { status: "success" };
  }

  const supabase = await createClient();

  const { error } = await supabase.from("playbook_requests").insert({
    query: parsed.data.query,
    email: parsed.data.email,
    // Stored for admin triage only. The pathname without its query string —
    // AGENTS.md forbids query strings in stored context, and a search term is
    // exactly the kind of thing that should not be sitting in a column.
    pathname: "/search",
  });

  if (error) {
    // The reader gets a plain apology and no detail: the insert error can name
    // columns and constraints, none of which is useful to them and all of which
    // is noise about the internals of a form that failed.
    return {
      status: "error",
      message: "We could not send that just now. Please try again in a moment.",
    };
  }

  track("request_submitted", { has_email: parsed.data.email !== null });

  return { status: "success" };
}