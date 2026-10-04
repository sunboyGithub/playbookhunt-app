import "server-only";

import { createClient } from "@supabase/supabase-js";

import { getEnv } from "@/lib/env";

/**
 * Service-role client. Bypasses RLS entirely.
 *
 * Only for trusted server work — admin actions, cron jobs and moderation —
 * where the caller has already established the caller is an administrator.
 * Never import this from a client component or return it across the wire.
 */
export function createAdminClient() {
  const env = getEnv();
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set. Admin operations require the service-role key.",
    );
  }

  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
