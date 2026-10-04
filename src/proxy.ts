import type { NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

/**
 * Runs on every request to keep the Supabase auth session fresh.
 *
 * Next.js 16 renamed the `middleware` file convention to `proxy`.
 *
 * P4 adds the ⌘K palette and mobile menu work here; P8 adds the
 * protected-route and pending-action resume logic.
 */
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Everything except static assets and image files, so the session is
     * refreshed for pages, server actions and API routes without paying for
     * static files.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
