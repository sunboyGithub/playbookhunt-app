"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { signOut } from "@/app/actions/sign-out";
import { viewerInitials, type Viewer } from "@/lib/auth/viewer-shape";

/**
 * The signed-in header: avatar, and the menu behind it. Frame 9, right edge.
 *
 * The four items are the brief's: My playbooks, Create a playbook, Settings &
 * reminders, Sign out. "Settings & reminders" points at `/me?tab=settings`,
 * which this prompt puts on the same page as the saved/tried/reported tabs
 * rather than giving a four-item menu one route that 404s.
 *
 * A hand-rolled popover rather than the shadcn `DropdownMenu`: the same
 * click-away-and-Escape handling, without the focus-trap and portal machinery a
 * four-item menu does not need. The menu is not modal, so trapping focus in it
 * would make the rest of the header unreachable while it is open.
 */
export function AccountMenu({ viewer }: { viewer: Viewer }) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!container.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="relative" ref={container}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Account menu"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex size-9 items-center justify-center rounded-full ring-2 ring-muse-ring transition-opacity hover:opacity-85"
        data-testid="account-menu-trigger"
      >
        <Avatar className="size-9">
          {viewer.avatarUrl ? <AvatarImage src={viewer.avatarUrl} alt="" /> : null}
          <AvatarFallback className="bg-muse-soft text-sm font-medium text-muse">
            {viewerInitials(viewer)}
          </AvatarFallback>
        </Avatar>
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="Account"
          className="absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-xl border border-border bg-popover shadow-lg"
          data-testid="account-menu"
        >
          <div className="border-b border-border px-4 py-3">
            <p className="truncate text-sm font-medium">{viewer.displayName ?? "Signed in"}</p>
            <p className="truncate text-xs text-muted-foreground">{viewer.email}</p>
          </div>

          <div className="p-1.5">
            <MenuItem
              href="/me"
              label="My playbooks"
              onNavigate={() => setOpen(false)}
              current={pathname === "/me"}
            />
            <MenuItem
              href="/create"
              label="Create a playbook"
              onNavigate={() => setOpen(false)}
              current={pathname === "/create"}
            />
            <MenuItem
              href="/me?tab=settings"
              label="Settings & reminders"
              onNavigate={() => setOpen(false)}
            />
          </div>

          {/* Sign out is a form, not a link: it has to reach the server to clear
              the cookie, and an <a href="/logout"> would be a GET that any
              prefetcher or crawler could follow. */}
          <form action={signOut} className="border-t border-border p-1.5">
            <button
              type="submit"
              role="menuitem"
              className="flex w-full items-center rounded-lg px-3 py-2 text-left text-sm hover:bg-accent"
              data-testid="sign-out"
            >
              Sign out
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}

function MenuItem({
  href,
  label,
  onNavigate,
  current,
}: {
  href: string;
  label: string;
  onNavigate: () => void;
  current?: boolean;
}) {
  return (
    <Link
      href={href}
      role="menuitem"
      onClick={onNavigate}
      aria-current={current ? "page" : undefined}
      className={
        current
          ? "block rounded-lg bg-accent px-3 py-2 text-sm font-medium"
          : "block rounded-lg px-3 py-2 text-sm hover:bg-accent"
      }
    >
      {label}
    </Link>
  );
}