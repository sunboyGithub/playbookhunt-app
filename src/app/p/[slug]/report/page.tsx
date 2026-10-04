import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";

import { SignInBody } from "@/components/auth/sign-in-body";
import { ReportForm } from "@/components/report/report-form";
import { getEnv } from "@/lib/env";
import { toOutcomeType } from "@/lib/stats/detail";
import {
  reportFieldsFrom,
  type OutcomeType,
  type ReportResult,
} from "@/lib/report/shape";
import { createClient } from "@/lib/supabase/server";
import { lastTryAgentSlug, getReportForEdit } from "@/server/queries/me";
import { getPublishedPlaybookBySlug } from "@/server/queries/playbooks";
import { listAgents } from "@/server/queries/taxonomy";

/**
 * `/p/[slug]/report` — the outcome form on a page of its own.
 *
 * Two reasons this exists as a route and not only as a dialog:
 *
 * - **The follow-up email links here.** A one-click "it worked" link has to land
 *   somewhere that can read `?result=worked` and open the form already
 *   answered, and a dialog has no URL to carry that.
 * - **It is shareable and refreshable.** A reader who closes the tab mid-report
 *   can come back. The form itself holds no durable state, so re-opening
 *   re-asks — which is honest, because nothing was sent.
 *
 * `robots: noindex` because it is a form, not content: it has nothing to rank
 * for and it is a duplicate of the playbook it belongs to.
 */

export const metadata: Metadata = {
  title: "Report your result",
  robots: { index: false },
};

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** Only the three real values preselect the form. Anything else is ignored. */
function toResult(value: string | string[] | undefined): ReportResult | null {
  const single = Array.isArray(value) ? value[0] : value;
  return single === "worked" || single === "partly" || single === "didnt" ? single : null;
}

export default async function ReportPage({ params, searchParams }: Props) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const playbook = await getPublishedPlaybookBySlug(slug);

  if (!playbook) {
    notFound();
  }

  const supabase = await createClient();
  const { data: sessionData } = await supabase.auth.getUser();
  const userId = sessionData.user?.id ?? null;

  const agents = await listAgents();
  const agentOptions = agents.selectable.map((agent) => ({
    slug: agent.slug,
    name: agent.display_name,
  }));

  const preselected = toResult(query.result);
  const outcomeType = toOutcomeType(playbook.outcome_type) as OutcomeType | null;

  // `?edit=1` is a request to correct an existing report, and it is honoured only
  // when there is one to correct and the window is still open. A reader who
  // arrives here with `?edit=1` and nothing to edit gets the ordinary form —
  // which, if they have already reported this version, will tell them so on
  // submit and offer them the same window.
  const wantsEdit = query.edit !== undefined;
  const existing = userId && wantsEdit ? await getReportForEdit(userId, playbook.id) : null;
  const editing = existing?.editable ? existing : null;

  // The share sheet on the success screen points at the playbook, not at this
  // form: sharing a form is not an outcome anyone can act on.
  const shareUrl = `${getEnv().NEXT_PUBLIC_SITE_URL}/p/${playbook.slug}`;

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <nav aria-label="Breadcrumb">
        <ol className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
          <li>
            <Link href="/" className="hover:text-foreground">
              Home
            </Link>
          </li>
          <li aria-hidden>
            <ChevronRight className="size-3.5" />
          </li>
          <li>
            <Link href={`/p/${playbook.slug}`} className="hover:text-foreground">
              {playbook.title}
            </Link>
          </li>
          <li aria-hidden>
            <ChevronRight className="size-3.5" />
          </li>
          <li aria-current="page" className="text-foreground">
            Report
          </li>
        </ol>
      </nav>

      <h1 className="mt-4 text-2xl font-semibold tracking-tight">
        {editing ? "Change your report" : "Did it work for you?"}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {editing
          ? "You can change this for 24 hours, and delete it after that."
          : "Takes about 30 seconds. Your report is how the next person finds out."}
      </p>

      <div className="mt-6">
        {userId ? (
          <ReportForm
            playbookId={playbook.id}
            playbookSlug={playbook.slug}
            versionId={playbook.current_version?.id ?? ""}
            title={playbook.title}
            shareUrl={shareUrl}
            outcomeType={outcomeType}
            outcomeUnit={playbook.outcome_unit}
            reportFields={reportFieldsFrom(playbook.report_fields)}
            agents={agentOptions}
            defaultAgentSlug={editing?.agentSlug ?? (await lastTryAgentSlug(userId, playbook.id))}
            defaultResult={preselected}
            editing={editing}
          />
        ) : (
          /* Signed out. The form is not rendered at all rather than rendered
             and refused on submit: an input the reader has typed into and then
             watches get rejected is the worst version of this, and reporting is
             the one place AGENTS.md does allow requiring an account. The panel
             carries the resume, so signing in returns them here. */
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <SignInBody reason="report" returnTo={`/p/${playbook.slug}/report`} />
          </div>
        )}
      </div>
    </main>
  );
}