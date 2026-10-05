import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ExternalLink } from "lucide-react";

import { AdminPage, Panel, Field } from "@/components/admin/shell";
import { CoreFieldsForm } from "@/components/admin/core-fields-form";
import { VerifyButton } from "@/components/admin/verify-button";
import { VersionEditor } from "@/components/admin/version-editor";
import { getAdminPlaybook, listVersions } from "@/server/admin/queries/playbooks";
import { requireAdmin } from "@/server/admin/session";

/**
 * One playbook's editor.
 *
 * Three panels, in the order somebody does the work:
 *
 * 1. The core fields — title, promise, who it is for, status.
 * 2. The prompt, inputs and steps — saved as a new version.
 * 3. The history — what changed, when, and which one is live.
 *
 * The two edit forms are separate because the two things they write are separate:
 * one is a row, the other is an append to a list. Merging them into one "Save"
 * would mean every typo fix in the promise produced a version, and the version
 * list would stop being a record of changes to the playbook's behaviour.
 *
 * Drafts are editable here and not on the public site. `getAdminPlaybook` reads
 * the current version with the administrator's client rather than the shared RLS
 * helper, precisely because the content most often being edited is the content
 * that is not published yet.
 */

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const session = await requireAdmin();
  const { id } = await params;
  const playbook = await getAdminPlaybook(session.client, id);

  return { title: playbook ? `${playbook.title} — Admin` : "Playbook — Admin" };
}

function date(value: string | null): string {
  return value ? new Date(value).toLocaleString() : "—";
}

/** The current version's content as an editable starting point. */
function toDraft(version: {
  prompt_template: string;
  inputs: { key: string; label: string; type: string; required: boolean; help: string | null; options: unknown }[];
  steps: { body: string }[];
}) {
  return {
    promptTemplate: version.prompt_template,
    changelog: "",
    inputs: version.inputs.map((input) => ({
      key: input.key,
      label: input.label,
      type: (input.type || "text") as "text",
      required: input.required,
      help: input.help ?? "",
      choices: Array.isArray(input.options) ? input.options.join(", ") : "",
    })),
    steps: version.steps.map((step) => step.body),
  };
}

export default async function AdminPlaybookPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  const { id } = await params;

  const playbook = await getAdminPlaybook(session.client, id);
  if (!playbook) {
    notFound();
  }

  const versions = await listVersions(session.client, playbook.id);
  const current = playbook.currentVersion;
  const nextVersion = (versions[0]?.version ?? 0) + 1;

  return (
    <AdminPage
      title={playbook.title}
      description={`/p/${playbook.slug}`}
      actions={
        <>
          {playbook.status === "published" ? (
            <Link
              href={`/p/${playbook.slug}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-foreground/20"
            >
              <ExternalLink className="size-4" aria-hidden />
              See it as a reader
            </Link>
          ) : (
            <span className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground">
              Not public — a reader would get a 404.
            </span>
          )}
          <Link
            href="/admin/playbooks"
            className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-foreground/20"
          >
            All playbooks
          </Link>
        </>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <Panel
            title="Core fields"
            description="What the playbook is and whether it is on the site."
          >
            <CoreFieldsForm
              values={{
                id: playbook.id,
                title: playbook.title,
                promise: playbook.promise,
                whoFor: playbook.whoFor ?? "",
                whoNotFor: playbook.whoNotFor ?? "",
                status: playbook.status,
                previewImageUrl: playbook.previewImageUrl ?? "",
              }}
            />
          </Panel>

          <Panel
            title="Prompt, inputs and steps"
            description={
              current
                ? `Editing these publishes version ${nextVersion}. Version ${current.version} stays as it is.`
                : `There is no content yet. Publishing version ${nextVersion} is what gives this playbook a prompt.`
            }
          >
            <VersionEditor
              playbookId={playbook.id}
              nextVersion={nextVersion}
              draft={
                current
                  ? toDraft(current)
                  : { promptTemplate: "", changelog: "", inputs: [], steps: [] }
              }
            />
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="Verification">
            <p className="text-sm text-muted-foreground">
              Last verified:{" "}
              <span className="text-foreground">{date(playbook.lastVerifiedAt)}</span>
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              This is the date under &ldquo;last verified&rdquo; on the public page. It moves when an
              approved piece of evidence backs a report that said it worked, or when you press the
              button because you ran it yourself.
            </p>
            <div className="mt-3">
              <VerifyButton playbookId={playbook.id} lastVerifiedAt={playbook.lastVerifiedAt} />
            </div>
          </Panel>

          <Panel title="Facts">
            <dl className="space-y-3">
              <Field label="Slug">
                <code className="font-mono text-xs">{playbook.slug}</code>
              </Field>
              <Field label="Status">{playbook.status}</Field>
              <Field label="Time">
                {playbook.timeMin ?? "?"}–{playbook.timeMax ?? "?"} minutes
              </Field>
              <Field label="Written by">{playbook.authorName ?? "Nobody — it came in as a submission"}</Field>
            </dl>
          </Panel>

          {current ? (
            <Panel title="Agents" description="Which agents this is recorded as working with.">
              {current.agents.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  None recorded. An untested playbook cannot be recommended for an agent it has not
                  been tried on.
                </p>
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {current.agents.map((agent) => (
                    <li key={agent.slug} className="flex items-center gap-2">
                      <span className="font-medium">{agent.display_name}</span>
                      <span className="text-xs text-muted-foreground">{agent.status}</span>
                      {agent.tested ? (
                        <span className="rounded bg-tint-mint px-1.5 py-0.5 text-[11px] text-worked">
                          tested
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          ) : null}

          <Panel title="Sources" description="Where this came from.">
            {current?.sources.length ? (
              <ul className="space-y-1.5 text-sm">
                {current.sources.map((source) => (
                  <li key={source.id}>
                    {source.url ? (
                      <a
                        href={source.url}
                        rel="noopener noreferrer nofollow"
                        target="_blank"
                        className="underline"
                      >
                        {source.title ?? source.url}
                      </a>
                    ) : (
                      (source.title ?? `${source.platform} ${source.handle ?? ""}`)
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No sources recorded.</p>
            )}
          </Panel>

          <Panel title="Version history">
            {versions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No versions yet.</p>
            ) : (
              <ol className="space-y-2 text-sm" data-testid="version-history">
                {versions.map((version) => (
                  <li key={version.id} className="flex gap-2">
                    <span className="w-14 shrink-0 tabular-nums text-muted-foreground">
                      v{version.version}
                    </span>
                    <span className="min-w-0 flex-1">
                      {version.changelog ?? (
                        <span className="italic text-muted-foreground">no changelog</span>
                      )}
                      <span className="block text-xs text-muted-foreground">
                        {date(version.createdAt)}
                        {version.isCurrent ? " · live" : ""}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        </div>
      </div>
    </AdminPage>
  );
}