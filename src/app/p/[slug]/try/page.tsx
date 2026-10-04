import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { InputsList } from "@/components/playbook/detail/inputs-list";
import { PromptBlock } from "@/components/playbook/detail/prompt-block";
import { getPublishedPlaybookBySlug } from "@/server/queries/playbooks";

/**
 * The standalone try page.
 *
 * Deliberately minimal, and I want to be clear that this is incomplete rather
 * than shipped: P7 replaces it with the try sheet — an agent picker, the inputs
 * filled into the prompt, and the launch handoff. Until then this page does the
 * one thing it can do honestly, which is show the prompt next to what the
 * reader needs to gather.
 *
 * It exists at all because the sidebar's "Try this playbook" points here, and a
 * button that 404s is worse than one that does less.
 */
export default async function TryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const playbook = await getPublishedPlaybookBySlug(slug);

  if (!playbook) {
    notFound();
  }

  const content = playbook.current_version;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <Link
        href={`/p/${playbook.slug}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft aria-hidden className="size-4" />
        Back to {playbook.title}
      </Link>

      <h1 className="mt-4 text-2xl font-semibold tracking-tight">Try this playbook</h1>
      <p className="mt-1 text-muted-foreground">{playbook.promise}</p>

      <div className="mt-6 space-y-8">
        {content ? <InputsList inputs={content.inputs} /> : null}

        {content ? (
          <PromptBlock
            prompt={content.prompt_template}
            playbookId={playbook.id}
            versionId={content.id}
            tryHref={`/p/${playbook.slug}/try`}
            stepCount={content.steps.length}
          />
        ) : null}
      </div>
    </div>
  );
}