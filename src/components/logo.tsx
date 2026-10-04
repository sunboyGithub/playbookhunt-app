import Link from "next/link";

import { cn } from "@/lib/utils";

/**
 * Wordmark: "Playbook" + "Hunt", with "Hunt" in the brand accent.
 *
 * Client-side navigation on the home logo is required by AGENTS.md, and the
 * transition must keep the current page visible until the destination is ready.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      // The two spans below would otherwise expose "PlaybookHunt" with no
      // space to assistive technology.
      aria-label="Playbook Hunt"
      className={cn(
        "inline-flex items-baseline text-[17px] font-semibold tracking-tight",
        className,
      )}
    >
      <span className="text-foreground">Playbook</span>
      <span className="text-brand">Hunt</span>
    </Link>
  );
}
