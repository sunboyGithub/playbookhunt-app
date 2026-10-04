"use client";

import { Menu, Plus, Search, SquarePen, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

const NAV_LINKS = [
  { href: "/playbooks", label: "Playbooks" },
  { href: "/kits", label: "Starter kits" },
  { href: "/categories", label: "Categories" },
] as const;

export function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-4 px-4">
        <Logo />

        {/* Desktop navigation */}
        <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex-1" />

        {/* Search trigger — the ⌘K palette is wired up in P4. */}
        <button
          type="button"
          className="hidden h-9 w-56 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm text-muted-foreground transition-colors hover:bg-accent lg:flex"
        >
          <Search className="size-4" aria-hidden />
          <span>Search playbooks</span>
          <kbd className="ml-auto rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[11px]">
            ⌘K
          </kbd>
        </button>

        <Button variant="ghost" size="sm" className="hidden md:inline-flex" asChild>
          <Link href="/create">
            <Plus className="size-4" aria-hidden />
            Create a playbook
          </Link>
        </Button>

        <Button variant="ghost" size="sm" className="hidden md:inline-flex" asChild>
          <Link href="/search">
            <SquarePen className="size-4" aria-hidden />
            Report a result
          </Link>
        </Button>

        <Button variant="outline" size="sm" className="hidden md:inline-flex" asChild>
          <Link href="/login">Sign in</Link>
        </Button>

        {/* Mobile controls */}
        <button
          type="button"
          aria-label="Search"
          className="inline-flex size-10 items-center justify-center rounded-lg text-foreground transition-colors hover:bg-accent lg:hidden"
        >
          <Search className="size-5" aria-hidden />
        </button>

        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetTrigger asChild>
            <button
              type="button"
              aria-label="Open menu"
              className="inline-flex size-10 items-center justify-center rounded-lg text-foreground transition-colors hover:bg-accent md:hidden"
            >
              <Menu className="size-5" aria-hidden />
            </button>
          </SheetTrigger>

          <SheetContent side="right" className="w-full max-w-sm p-0">
            <SheetHeader className="border-b border-border p-4">
              <SheetTitle className="flex items-center justify-between">
                <Logo />
                <button
                  type="button"
                  aria-label="Close menu"
                  onClick={() => setMenuOpen(false)}
                  className="inline-flex size-10 items-center justify-center rounded-lg text-foreground transition-colors hover:bg-accent"
                >
                  <X className="size-5" aria-hidden />
                </button>
              </SheetTitle>
            </SheetHeader>

            {/* Labels stay descriptive here, per AGENTS.md. */}
            <nav className="flex flex-col p-2" aria-label="Mobile">
              <Link
                href="/login"
                onClick={() => setMenuOpen(false)}
                className="flex min-h-11 items-center px-3 text-sm font-medium"
              >
                Sign in
              </Link>
              <MobileLink href="/playbooks" onNavigate={() => setMenuOpen(false)}>
                Playbooks
              </MobileLink>
              <MobileLink href="/kits" onNavigate={() => setMenuOpen(false)}>
                Starter kits
              </MobileLink>
              <MobileLink href="/categories" onNavigate={() => setMenuOpen(false)}>
                Categories
              </MobileLink>

              <div className="my-2 h-px bg-border" />

              <MobileLink href="/create" onNavigate={() => setMenuOpen(false)}>
                + Create a playbook
              </MobileLink>
              <MobileLink href="/search" onNavigate={() => setMenuOpen(false)}>
                Report a result
              </MobileLink>
            </nav>

            <MobileFooter onNavigate={() => setMenuOpen(false)} />
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}

function MobileLink({
  href,
  onNavigate,
  children,
}: {
  href: string;
  onNavigate: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className="flex min-h-11 items-center px-3 text-sm transition-colors hover:bg-accent"
    >
      {children}
    </Link>
  );
}

const FOOTER_LINKS = [
  { href: "/how-we-verify", label: "How we verify" },
  { href: "/request", label: "Request" },
  { href: "/create", label: "Create" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
] as const;

function MobileFooter({ onNavigate }: { onNavigate: () => void }) {
  return (
    <div className="mt-auto border-t border-border p-2">
      {FOOTER_LINKS.map((link) => (
        <MobileLink key={link.href} href={link.href} onNavigate={onNavigate}>
          {link.label}
        </MobileLink>
      ))}
    </div>
  );
}
