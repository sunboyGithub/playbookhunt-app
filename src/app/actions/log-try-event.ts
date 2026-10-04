"use server";

import { cookies } from "next/headers";

import { createClient } from "@/lib/supabase/server";
import { insertTryEvent } from "@/server/queries/try-events";

/**
 * Log that someone did something with a playbook: opened the try flow, copied
 * the prompt.
 *
 * Anonymous by design. The whole point is to count the people who tried a
 * playbook, and requiring an account first would mean the try count measures
 * signups rather than usage. `try_events` has no public select policy and its
 * `user_id` column is ungranted to anon, so a row written here is readable only
 * by an admin — a visitor cannot see what they logged, and cannot see what
 * anyone else logged.
 *
 * Never throws. This runs in the background of an interaction the reader is
 * already completing; a failed insert must not surface as an error on a page
 * that has otherwise worked, and the alternative — letting it reject — would
 * turn a copy button into a thing that can fail visibly.
 */

const DEVICE_COOKIE = "ph_device";
const COOKIE_MAX_AGE = 400 * 86_400_000;

/**
 * A stable, opaque per-browser id.
 *
 * Generated server-side and kept in a first-party cookie. No fingerprinting, no
 * IP, no user agent: `try_events.device_id` exists to stop one person inflating
 * their own tried_count, and a random id does that as well as anything cheaper
 * and without collecting anything about the reader to do it.
 */
function randomDeviceId(): string {
  return crypto.randomUUID();
}

async function deviceId(): Promise<string> {
  const store = await cookies();
  const existing = store.get(DEVICE_COOKIE)?.value;
  if (existing) {
    return existing;
  }

  const created = randomDeviceId();
  // Written best-effort: `cookies().set` throws inside a Server Component, and
  // a reader who gets a fresh id per page view is still counted once per view,
  // which is no worse than having no id at all.
  try {
    store.set(DEVICE_COOKIE, created, {
      path: "/",
      maxAge: COOKIE_MAX_AGE,
      sameSite: "lax",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
    });
  } catch {
    // Not a Server Action invocation; carry on with the unpersisted id.
  }

  return created;
}

export async function logTryEvent(input: {
  playbookId: string;
  versionId?: string | null;
  /** Agent slug, resolved here. Null is recorded as "no agent chosen". */
  agentSlug?: string | null;
  action: "started" | "copied" | "opened";
}): Promise<{ id: string | null }> {
  const supabase = await createClient();

  const { data: sessionData } = await supabase.auth.getUser();

  return insertTryEvent(supabase, {
    playbookId: input.playbookId,
    versionId: input.versionId ?? null,
    agentSlug: input.agentSlug,
    // Set when someone is signed in, null otherwise. Read here rather than
    // sent by the client, so a caller cannot claim a try belongs to a user.
    userId: sessionData.user?.id ?? null,
    deviceId: await deviceId(),
    action: input.action,
  });
}
