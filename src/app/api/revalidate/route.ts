import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { getEnv } from "@/lib/env";

/**
 * On-demand revalidation for a playbook's statistics.
 *
 * The detail page revalidates itself every 300 seconds, which bounds staleness
 * but also means a report filed just after a revalidation waits up to five
 * minutes to show up. The P9 aggregation job calls this the moment it writes a
 * fresh `playbook_stats` row, so the number a reader sees changes when the data
 * changes rather than on a schedule.
 *
 * The body names a slug. A path parameter would need every playbook to be
 * enumerated in the route, and revalidating the whole section is a far heavier
 * hammer for the one page that changed.
 *
 * **Unauthenticated, and that is a real limitation.** `revalidatePath` is a
 * server-side operation with no built-in authorisation, so anyone who knows this
 * URL can force the site to re-render pages. That costs CPU and cannot leak
 * data — the caller gets a 200 either way and learns nothing about the
 * playbook's contents — but it is not free. A shared secret in the header is the
 * fix; it is not done yet because no caller exists to hold the secret, and
 * leaving a half-implemented check behind would be worse than documenting the
 * gap. See the P9 milestone.
 */
export async function POST(request: Request) {
  let slug: unknown;

  try {
    const body = (await request.json()) as { slug?: unknown };
    slug = body?.slug;
  } catch {
    return NextResponse.json({ ok: false, error: "expected a JSON body" }, { status: 400 });
  }

  if (typeof slug !== "string" || slug.length === 0) {
    return NextResponse.json({ ok: false, error: "slug is required" }, { status: 400 });
  }

  revalidatePath(`/p/${slug}`);

  // Returned rather than logged: the response is the only confirmation the job
  // gets that the call reached the app at all, and a job that silently no-ops
  // looks exactly like a job that worked.
  return NextResponse.json({
    ok: true,
    revalidated: `/p/${slug}`,
    site: getEnv().NEXT_PUBLIC_SITE_URL,
  });
}