import type { Metadata } from "next";

import { AdminNav } from "@/components/admin/admin-nav";
import { requireAdmin } from "@/server/admin/session";

/**
 * The admin area's gate.
 *
 * `requireAdmin()` throws `notFound()` for anyone who is not an administrator, so
 * a signed-in reader who types `/admin` gets the same page as somebody who typed
 * a URL that does not exist. That is the acceptance criterion, and it is also the
 * only version of it that does not advertise what is behind the door.
 *
 * ## Why the check is here *and* in every action
 *
 * A layout cannot protect a server action. Server actions are HTTP endpoints with
 * their own auth; a request that skips the layout entirely still reaches them.
 * So the check is written once in `adminSession()` and used by both — the layout
 * for pages, the actions for the writes. This layout is the one that makes the
 * area unfindable; the actions are the ones that make it unwritable.
 *
 * ## Why no cache
 *
 * `force-dynamic` rather than a revalidate window: the contents are private, and
 * a layout that could be served from a shared cache would be a layout that could
 * be served to somebody who is not signed in. The cost is a viewer lookup per
 * navigation inside /admin, which is one profile row.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin",
  // Private tooling. There is nothing here a search engine should reach, and the
  // pages are already behind a 404 — this is belt and braces for the case where
  // somebody links to one from outside.
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
      <AdminNav />
      {children}
    </div>
  );
}