import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Viewer } from "@/lib/auth/viewer-shape";

/**
 * Who is reading, for a server component.
 *
 * One shape, resolved in one place, because "is someone signed in" gets asked
 * on every page in this app and each answer costs a JWT validation plus a
 * profile read. Doing it per call site is how the header ends up believing a
 * reader is signed out while the page beneath them believes the opposite.
 *
 * The type itself lives in `viewer-shape.ts`, without the `server-only`
 * directive, because the header's avatar menu is a client component and needs
 * it too.
 *
 * `profiles` is readable by everyone (the sign-up trigger writes a row before
 * anyone asks), so the read below needs no admin key and no extra policy.
 */
export async function getViewer(): Promise<Viewer | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();

    if (error || !data.user?.email) {
      return null;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name, avatar_url, role")
      .eq("id", data.user.id)
      .maybeSingle();

    return {
      id: data.user.id,
      email: data.user.email,
      displayName: profile?.display_name ?? null,
      avatarUrl: profile?.avatar_url ?? null,
      role: profile?.role === "admin" ? "admin" : "user",
    };
  } catch {
    return null;
  }
}

export type { Viewer };