import { NextResponse, type NextRequest } from "next/server";

import { decodePendingAction, safeReturnTo, type PendingAction } from "@/lib/auth/pending-action";
import { createClient } from "@/lib/supabase/server";

/**
 * Where Google, Facebook and the email link all arrive.
 *
 * Three reasons this has to be a route rather than a page:
 *
 * - The code-to-session exchange has to write cookies, and only a Route Handler
 *   can. A Server Component renders and is done; it cannot set a header.
 * - The pending action is completed *here*, while we still hold the session and
 *   know the reader wanted it. Completing it on the landing page instead means
 *   putting a base64 blob in the address bar of the page the reader lands on,
 *   where it survives a copy-paste, a shared link and a bookmark.
 * - One implementation serves both flows. OAuth and a magic link differ only in
 *   how they got here, and a session resumes identically.
 */

/** Query keys the landing page reads and then strips. */
const RESUME_KEY = "ph_resume";
const SCROLL_KEY = "ph_scroll";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const pending = decodePendingAction(searchParams.get("pa"));

  // An explicit `next` is the fallback for the plain `/login` link in the
  // header, which has no pending action to carry.
  const next = safeReturnTo(searchParams.get("next"), "/");

  const back = pending ? pending.returnTo : next;
  const target = new URL(safeReturnTo(back, "/"), origin);

  // The provider refused, or the reader closed the window. Say so rather than
  // dropping them on a homepage with no explanation.
  const providerError = searchParams.get("error_description") ?? searchParams.get("error");
  if (providerError) {
    target.searchParams.set("signin_error", providerError.slice(0, 200));
    return NextResponse.redirect(target);
  }

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      target.searchParams.set("signin_error", "That sign-in link has expired. Try again.");
      return NextResponse.redirect(target);
    }

    if (pending) {
      const completed = await completeAction(pending);
      if (completed) {
        target.searchParams.set(RESUME_KEY, pending.action);
      }
    }
  }

  if (pending && pending.scrollY > 0) {
    target.searchParams.set(SCROLL_KEY, String(pending.scrollY));
  }

  return NextResponse.redirect(target);
}

/**
 * Do the thing the reader was trying to do.
 *
 * Only `save` is completed here. `report` and `create` navigate rather than
 * write — the report form needs a playbook page to sit on, and the create form
 * is a page of its own — so they resume by landing on the right route with the
 * scroll position restored, and the reader does the rest.
 *
 * Returns whether an action actually completed, which is what decides between a
 * confirmation toast and silence. Telling someone "Saved" when the write was
 * refused by RLS is the failure mode this return value exists to prevent.
 */
async function completeAction(pending: PendingAction): Promise<boolean> {
  if (pending.action !== "save" || !pending.playbookId) {
    return false;
  }

  const supabase = await createClient();
  const { data: sessionData } = await supabase.auth.getUser();
  if (!sessionData.user) {
    return false;
  }

  const { error } = await supabase
    .from("saves")
    .insert({ user_id: sessionData.user.id, playbook_id: pending.playbookId });

  // 23505: already saved. The state that was asked for is the state that
  // exists, so this is a success and the toast is still true.
  return !error || error.code === "23505";
}