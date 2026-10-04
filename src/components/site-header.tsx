"use client";

import { Menu, Plus, SquarePen, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { AccountMenu } from "@/components/auth/account-menu";
import { signOut } from "@/app/actions/sign-out";
import { CommandPalette } from "@/components/command-palette";
import { Logo } from "@/components/logo";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { viewerInitials, type Viewer } from "@/lib/auth/viewer-shape";

const NAV_LINKS = [
  { href: "/playbooks", label: "Playbooks" },
  { href: "/kits", label: "Starter kits" },
  { href: "/categories", label: "Categories" },
] as const;

export type SiteHeaderProps = {
  /**
   * Categories, passed in from the server layout.
   *
   * The palette's rest state lists them, so they have to come from the database
   * rather than a constant in the component — otherwise the list would drift
   * from the taxonomy every time a category was renamed or added.
   */
  categories: { slug: string; name: string; emoji: string }[];
  /**
   * The signed-in reader, or null.
   *
   * Resolved once in the root layout and passed down rather than fetched here,
   * because the header renders on every route and a second `getUser()` would be
   * a second JWT validation per page view. It also means the header and the page
   * can never disagree about whether anyone is signed in.
   */
  viewer?: Viewer | null;
};

export function SiteHeader({ categories, viewer = null }: SiteHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    // Frame 01a shows the header sitting directly on the page surface with a
    // single hairline under it — no translucent blur bar.
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-4 px-4">
        <Logo />

        {/* Desktop navigation */}
        <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-full px-3 py-2 text-sm font-medium text-foreground/90 transition-colors hover:bg-accent"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex-1" />

        {/* One palette, not one per breakpoint. Each instance registers its own
            global ⌘K listener and its own dialog, so rendering two meant two
            dialogs competing for the focus trap on every shortcut press. The
            trigger is responsive instead: a square icon button that becomes the
            labelled pill at lg, with the label and shortcut badge collapsing
            below that inside CommandPalette. */}
        <CommandPalette
          categories={categories}
          className="size-9 justify-center rounded-full border-transparent px-0 lg:h-9 lg:w-56 lg:justify-start lg:border-border lg:px-3.5"
        />

        <Button variant="outline" size="sm" className="hidden rounded-full md:inline-flex" asChild>
          <Link href="/create">
            <Plus className="size-4" aria-hidden />
            Create a playbook
          </Link>
        </Button>

        <Button variant="outline" size="sm" className="hidden rounded-full md:inline-flex" asChild>
          <Link href="/report">
            <SquarePen className="size-4" aria-hidden />
            Report a result
          </Link>
        </Button>

        {/* Solid near-black in the frame, not an outline. The avatar replaces
            the button rather than sitting beside it — a header with both a
            "Sign in" and an avatar on it tells a signed-in reader they are not. */}
        {viewer ? (
          <div className="hidden md:block">
            <AccountMenu viewer={viewer} />
          </div>
        ) : (
          <Button
            size="sm"
            className="hidden rounded-full bg-foreground text-background hover:bg-foreground/90 md:inline-flex"
            asChild
          >
            <Link href="/login" data-testid="sign-in-button">
              Sign in
            </Link>
          </Button>
        )}

        {/* Mobile controls */}
        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetTrigger asChild>
            <button
              type="button"
              aria-label="Open menu"
              className="inline-flex size-10 items-center justify-center rounded-lg text-foreground transition-colors hover:bg-accent md:hidden"
              data-testid="mobile-menu-trigger"
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
              {/* AGENTS.md: "Sign in or avatar". The mobile menu's account row
                  is the same decision the desktop header makes, one breakpoint
                  down — so a phone gets the full four-item menu rather than a
                  link that loses the reader on the way to their saves. */}
              {viewer ? (
                <div className="border-b border-border pb-2">
                  <p className="flex items-center gap-2 px-3 pt-1 text-xs text-muted-foreground">
                    <Avatar className="size-6">
                      {viewer.avatarUrl ? <AvatarImage src={viewer.avatarUrl} alt="" /> : null}
                      <AvatarFallback className="bg-muse-soft text-[10px] font-medium text-muse">
                        {viewerInitials(viewer)}
                      </AvatarFallback>
                    </Avatar>
                    {viewer.email}
                  </p>
                  <MobileLink href="/me" onNavigate={() => setMenuOpen(false)}>
                    My playbooks
                  </MobileLink>
                  <MobileLink href="/me?tab=settings" onNavigate={() => setMenuOpen(false)}>
                    Settings & reminders
                  </MobileLink>
                  <form action={signOut}>
                    <button
                      type="submit"
                      className="flex min-h-11 w-full items-center px-3 text-left text-sm font-medium"
                      data-testid="sign-out"
                    >
                      Sign out
                    </button>
                  </form>
                </div>
              ) : (
                <Link
                  href="/login"
                  onClick={() => setMenuOpen(false)}
                  className="flex min-h-11 items-center px-3 text-sm font-medium"
                  data-testid="sign-in-button"
                >
                  Sign in
                </Link>
              )}
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
              <MobileLink href="/report" onNavigate={() => setMenuOpen(false)}>
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
