import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser Supabase client. Safe in client components.
 *
 * Uses the anon key only, so every request is subject to RLS.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
