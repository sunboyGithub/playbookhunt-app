"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The admin navigation.
 *
 * Client only because it needs `usePathname` to know where it is. That is the
 * whole reason this file exists separately from the shell primitives: a header
 * that cannot tell you which queue you are in makes a moderation area feel like
 * eight unrelated pages.
 *
 * Counts are not here. A number next to every section would have to be read on
 * every navigation, and most of the sections are empty most of the time — the
 * dashboard already puts the three that matter above a click away.
 */

/** `exact` only has to be said for `/admin` itself, which every path starts with. */
const SECTIONS: { href: string; label: string; exact?: boolean }[] = [
  { href: "/admin", label: "Dashboard", exact: true },
  { href: "/admin/reports", label: "Reports" },
  { href: "/admin/evidence", label: "Evidence" },
  { href: "/admin/playbooks", label: "Playbooks" },
  { href: "/admin/collections", label: "Starter kits" },
  { href: "/admin/use-cases", label: "Use cases" },
  { href: "/admin/requests", label: "Requests" },
  { href: "/admin/feedback", label: "Feedback" },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Admin sections"
      className="mb-6 flex gap-1 overflow-x-auto border-b border-border pb-px"
    >
      {SECTIONS.map((section) => {
        const active = section.exact
          ? pathname === section.href
          : pathname === section.href || pathname.startsWith(`${section.href}/`);

        return (
          <Link
            key={section.href}
            href={section.href}
            aria-current={active ? "page" : undefined}
            className={`-mb-px shrink-0 border-b-2 px-3 py-2 text-sm transition-colors ${
              active
                ? "border-foreground font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {section.label}
          </Link>
        );
      })}
    </nav>
  );
}