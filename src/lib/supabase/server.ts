import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import type { Database } from "@/lib/database.types";
import { getEnv } from "@/lib/env";

/**
 * Supabase client for server components and server actions. Reads and writes
 * the auth session through cookies.
 *
 * Use this everywhere on the server. It is anon-key backed, so RLS still
 * applies; for privileged work use {@link createAdminClient}.
 */
export async function createClient() {
  const env = getEnv();
  const cookieStore = await cookies();

  return createServerClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component, which cannot write cookies.
          // Safe to ignore: middleware refreshes the session on every request.
        }
      },
    },
  });
}
