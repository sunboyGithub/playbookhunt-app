import Link from "next/link";

/**
 * Shared compact footer, used on every page.
 *
 * AGENTS.md: three columns and two rows on mobile, one naturally wrapping row
 * on wider screens, 44px touch targets, no tagline. P12c adds Feedback.
 */
const FOOTER_LINKS = [
  { href: "/how-we-verify", label: "How we verify" },
  { href: "/request", label: "Request" },
  { href: "/create", label: "Create" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
] as const;

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-border bg-background">
      <nav
        aria-label="Footer"
        className="mx-auto w-full max-w-6xl px-4 py-6 grid grid-cols-3 gap-x-4 gap-y-1 sm:flex sm:flex-wrap sm:gap-x-6"
      >
        {FOOTER_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="inline-flex min-h-11 items-center text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            {link.label}
          </Link>
        ))}
      </nav>
    </footer>
  );
}
