import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { TryPanel } from "@/components/try/try-panel";
import { toTryFields } from "@/lib/try/fields";
import { formatEvidenceHeadline } from "@/lib/stats/format";
import { createClient } from "@/lib/supabase/server";
import { getPublishedPlaybookBySlug } from "@/server/queries/playbooks";
import { listAgents } from "@/server/queries/taxonomy";

/**
 * The standalone try page.
 *
 * The same `TryPanel` the sheet renders, in a full-height column instead of a
 * side panel. Two entry points, one component: the sheet on the detail page, and
 * this page, which is what a card's hover Try and any shared link go to. A
 * listing page cannot inline every card's inputs and prompt to fill a dialog
 * nobody has opened, so the page is how the flow is reached from a list.
 *
 * The privacy note is shown here and not in the sheet. In a sheet it sits under
 * a form the reader has just opened mid-page, which reads as a wall of text; at
 * the top of a full page it is the natural place for it, before anything is typed.
 */
export const metadata = {
  title: "Try this playbook",
};

export default async function TryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const playbook = await getPublishedPlaybookBySlug(slug);

  if (!playbook) {
    notFound();
  }

  const content = playbook.current_version;

  const [agents, supabase] = await Promise.all([listAgents(), createClient()]);
  const { data: sessionData } = await supabase.auth.getUser();

  return (
    <div className="mx-auto flex h-[calc(100dvh-4rem)] w-full max-w-3xl flex-col px-4 py-6">
      <Link
        href={`/p/${playbook.slug}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft aria-hidden className="size-4" />
        Back to {playbook.title}
      </Link>

      <h1 className="mt-4 text-2xl font-semibold tracking-tight">Try this playbook</h1>

      <div className="mt-4 min-h-0 flex-1">
        <TryPanel
          playbookId={playbook.id}
          playbookSlug={playbook.slug}
          versionId={content?.id ?? null}
          promise={playbook.promise}
          inputs={toTryFields(content?.inputs ?? [])}
          promptTemplate={content?.prompt_template ?? ""}
          steps={content?.steps ?? []}
          selectableAgents={agents.selectable}
          comingSoonAgents={agents.coming_soon}
          recommendedEvidence={formatEvidenceHeadline(playbook.stats)}
          signedIn={Boolean(sessionData.user)}
          showPrivacyNote
        />
      </div>
    </div>
  );
}