import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "@/lib/database.types";

/**
 * Browser Supabase client. Safe in client components.
 *
 * Uses the anon key only, so every request is subject to RLS.
 *
 * `flowType: "pkce"` is load-bearing. The library's default is the older implicit
 * flow, which returns the session as a URL *fragment* — and a fragment is never
 * sent to a server, so `/auth/callback` could not read it and would have to
 * bounce the reader to the landing page for the browser to notice it in the
 * address bar. That defeats the point of the callback route: the pending action
 * has to be completed while we still hold the session.
 *
 * PKCE returns `?code=` instead, the route exchanges it, and the reader lands
 * back with the action already done. The verifier lives in localStorage, which
 * also means an email link clicked in a *different tab* of the same browser can
 * still complete — the case sessionStorage cannot cover.
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        flowType: "pkce",
        detectSessionInUrl: true,
      },
    },
  );
}
