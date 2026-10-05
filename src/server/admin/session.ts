import "server-only";

import { notFound } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getViewer } from "@/lib/auth/viewer";
import type { Viewer } from "@/lib/auth/viewer-shape";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/database.types";

/**
 * The one question every /admin page and every admin action asks first.
 *
 * ## Why the check is here and not in each caller
 *
 * An admin area is guarded in two independent places or it is not guarded. The
 * layout check is what a visitor meets; the per-action check is what stops a
 * server action from being called directly, since a server action is a public
 * HTTP endpoint that a layout cannot reach. Both go through this module so
 * there is one definition of "is an administrator" and one definition of the
 * client they act with.
 *
 * The client is the service-role one, because RLS on these tables says
 * `is_admin()` — which would work — but moderation also writes columns that no
 * client role holds a grant on at all (`status`, `is_verified`, `is_outlier`,
 * `moderation_note`). Going through RLS would mean adding the administrator's
 * browser the authority to change them, which is the authority a compromised
 * admin session should not have. The caller has already been verified here, so
 * the check the database would repeat is redundant.
 *
 * ## Why an action refuses and a page 404s
 *
 * The acceptance criterion is that a non-administrator gets a 404 from /admin,
 * not a redirect and not a "you are not allowed" page. Both of those confirm
 * the area exists. `notFound()` gives the same answer as a page that was never
 * built, which is the only answer that does not leak.
 *
 * An action has no page to 404, so it returns a result object every caller
 * handles. The message is deliberately vague and identical to the not-an-admin
 * one: a moderator queue is a list of what other people submitted and were
 * judged on, and there is no reason a non-administrator should learn that this
 * exists.
 */

/** What an admin action returns when the guard refuses. One message for both cases. */
export const NOT_AN_ADMIN = "That isn't available.";

export type AdminSession =
  | {
      ok: true;
      /** The administrator's profile id — written to every audit row. */
      adminId: string;
      viewer: Viewer;
      /** Service-role client. Never returned to a client component. */
      client: SupabaseClient<Database>;
    }
  | { ok: false; error: string };

/** The admitted half, named so a caller can hold one in a variable. */
export type Admin = Extract<AdminSession, { ok: true }>;

/**
 * Resolve the administrator, or refuse.
 *
 * `getViewer()` reads the profile through the anon-key client, so the role comes
 * from the same row the rest of the app reads — there is no second source for
 * "who is an admin" to drift from.
 */
export async function adminSession(): Promise<AdminSession> {
  const viewer = await getViewer();

  if (!viewer) {
    return { ok: false, error: NOT_AN_ADMIN };
  }

  if (viewer.role !== "admin") {
    return { ok: false, error: NOT_AN_ADMIN };
  }

  return { ok: true, adminId: viewer.id, viewer, client: createAdminClient() };
}

/**
 * The page guard.
 *
 * Throws `notFound()` rather than returning, because there is no useful way for a
 * page to render "you are not an administrator" and nothing in /admin should
 * appear to somebody who cannot use it — not even a heading.
 */
export async function requireAdmin(): Promise<Admin> {
  const session = await adminSession();

  if (!session.ok) {
    notFound();
  }

  return session;
}