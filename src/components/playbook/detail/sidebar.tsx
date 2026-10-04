import Link from "next/link";
import { BadgeCheck } from "lucide-react";

import { AgentMark } from "@/components/agents/agent-mark";
import { SourcesList } from "@/components/playbook/detail/sources-list";
import { WorksWith } from "@/components/playbook/detail/works-with";
import { Button } from "@/components/ui/button";
import { formatVerified } from "@/lib/stats/format";
import type { DetailStats } from "@/lib/stats/detail";
import type { Agent } from "@/server/queries/types";

/** Only what the sources block renders; see the note in `inputs-list.tsx`. */
type Source = {
  id: string;
  platform: string;
  handle: string | null;
  url: string | null;
  title: string | null;
};

/**
 * The sticky sidebar: verified badge, the try button, who it works with, who
 * wrote it, what inspired it, and what to know before starting.
 *
 * Sticky on desktop only. On a phone the same content moves under the header
 * (see the page), because a sidebar that is `position: sticky` at 390px either
 * eats the whole viewport or hides half of itself.
 */
export function DetailSidebar({
  activeAgent,
  comingSoon,
  sources,
  stats,
  authorName,
  hasAuthor,
  changelog,
  lastVerifiedAt,
  now,
  tryHref,
  triedCount,
}: {
  activeAgent: Agent | null;
  comingSoon: Agent[];
  sources: Source[];
  stats: DetailStats;
  /** Public display name. Never an email — see `authorLabel` below. */
  authorName: string | null;
  /** True when `author_id` is set, whether or not a display name came with it. */
  hasAuthor: boolean;
  changelog: string | null;
  lastVerifiedAt: string | null;
  now: number;
  tryHref: string;
  triedCount: number;
}) {
  const verified = formatVerified(lastVerifiedAt, now);

  return (
    <aside className="lg:sticky lg:top-20 lg:self-start">
      {verified ? (
        <p
          className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-verified-bg px-3 py-1 text-sm font-medium"
          data-testid="verified-badge"
        >
          <BadgeCheck aria-hidden className="size-4" />
          Verified {verified.replace(/^verified\s+/, "")}
        </p>
      ) : null}

      <Button asChild className="h-11 w-full rounded-full text-base">
        <Link href={tryHref} data-testid="try-button">
          Try this playbook
        </Link>
      </Button>

      <div className="mt-5 space-y-5">
        <WorksWith activeAgent={activeAgent} comingSoon={comingSoon} stats={stats} />

        <section aria-labelledby="author-heading">
          <h2 id="author-heading" className="text-sm font-semibold">
            Playbook by
          </h2>
          <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
            <AgentMark slug="muse" className="size-4 shrink-0" />
            {authorLabel(authorName, hasAuthor)}
          </p>
        </section>

        <SourcesList sources={sources} triedCount={triedCount} />

        <section aria-labelledby="good-to-know-heading">
          <h2 id="good-to-know-heading" className="text-sm font-semibold">
            Good to know
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Prices, eligibility and terms vary by provider and region. Check what applies to you
            before acting on anything here.
          </p>
          {changelog ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Last changed: {changelog}
            </p>
          ) : null}
        </section>
      </div>
    </aside>
  );
}

/**
 * Who wrote this playbook.
 *
 * Team-authored curated content says so. A community submission shows its
 * author's public display name, and only falls back to the generic label when
 * there is an author but no name — never to an email, and never to the team.
 * Misattributing someone's work to us is the one failure here with no recovery,
 * so the "no author at all" case is decided by `hasAuthor` rather than by
 * testing the name: an author who never set one is a different situation from
 * a playbook with no author.
 */
function authorLabel(authorName: string | null | undefined, hasAuthor: boolean): string {
  const name = authorName?.trim();
  if (name) {
    return name;
  }
  return hasAuthor ? "Community contributor" : "Playbook Hunt team";
}