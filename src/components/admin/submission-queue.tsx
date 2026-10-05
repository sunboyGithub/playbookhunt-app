"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AdminEmpty } from "@/components/admin/shell";
import { reviewSubmission } from "@/server/admin/actions/submissions";
import type { SubmissionRow } from "@/server/admin/queries/submissions";

/**
 * The review queue.
 *
 * ## Everything needed to decide is on the row
 *
 * Prompt, inputs, steps, who it is for, what the creator got when they tried it.
 * A reviewer who has to open four pages to approve something defers it, and an
 * unreviewed queue is a queue that does not exist — so the cost of this decision
 * is deliberately one scroll and three buttons.
 *
 * ## Publish is not a fourth button
 *
 * Approve *is* publishing: a submission is `in_review`, and RLS publishes nothing
 * but `status = 'published'`, so "approve" is the only control here that puts
 * anything on the internet. A separate publish button beside approve would be a
 * way to make something public without reviewing it.
 *
 * ## The creator's own note is shown, and is not a result
 *
 * "What result did you get?" is in `playbook_agents.notes` because the brief
 * forbids a creator's note from becoming site verification, a report, or a
 * statistic. So it is read here as a reviewer's context and appears nowhere else.
 * `tested` stays false until somebody sets it deliberately — approving a
 * submission does not do it, because approving says the writing is good enough to
 * publish, not that the site has run this against the agent.
 *
 * ## Nothing here writes to stats
 *
 * No column this queue touches is read by the ranking. Approval changes whether a
 * page exists; it does not change how that page is ordered against another, and
 * there is no review count, no quality score, and no vote anywhere in this file.
 */
export function SubmissionQueue({ items }: { items: SubmissionRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  if (items.length === 0) {
    return (
      <AdminEmpty>
        Nothing waiting. Submissions from /create land here.
      </AdminEmpty>
    );
  }

  const decide = (playbookId: string, decision: "approve" | "request_changes" | "reject") => {
    const note = (notes[playbookId] ?? "").trim();

    startTransition(async () => {
      const result = await reviewSubmission({ playbookId, decision, note: note === "" ? null : note });

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      toast.success(
        decision === "approve"
          ? "Approved and published."
          : decision === "reject"
            ? "Rejected. The creator can see why."
            : "Sent back with your note.",
      );
      router.refresh();
    });
  };

  return (
    <ul className="divide-y divide-border" data-testid="submission-queue">
      {items.map((item) => {
        const open = expanded === item.playbookId;
        const decided = item.reviewStatus !== "in_review";

        return (
          <li key={item.playbookId} className="px-5 py-4" data-testid="submission-row" data-status={item.reviewStatus}>
            <div className="flex flex-wrap items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{item.title}</p>
                <p className="text-sm text-muted-foreground">{item.promise}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {item.categoryName} · submission {item.submissionVersion} ·{" "}
                  {new Date(item.submittedAt).toLocaleString()}
                  {decided ? ` · ${item.reviewStatus.replace("_", " ")}` : ""}
                </p>
              </div>

              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setExpanded(open ? null : item.playbookId)}
                aria-expanded={open}
                className="shrink-0"
              >
                {open ? "Hide" : "Read"}
              </Button>
            </div>

            {open ? (
              <div className="mt-4 space-y-4">
                <div className="space-y-1">
                  <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Prompt
                  </h4>
                  <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-muted/50 p-3 text-xs">
                    {item.prompt}
                  </pre>
                </div>

                {item.inputs.length > 0 ? (
                  <div className="space-y-1">
                    <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Asks the reader for
                    </h4>
                    <ul className="text-sm">
                      {item.inputs.map((input) => (
                        <li key={input.key}>
                          <code className="font-mono text-xs">{`{{${input.key}}}`}</code>{" "}
                          {input.label}
                          {input.required ? "" : " (optional)"}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {item.steps.length > 0 ? (
                  <div className="space-y-1">
                    <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Steps
                    </h4>
                    <ol className="list-decimal space-y-0.5 pl-5 text-sm">
                      {item.steps.map((step, index) => (
                        <li key={`${index}-${step.slice(0, 12)}`}>{step}</li>
                      ))}
                    </ol>
                  </div>
                ) : null}

                {item.whoFor || item.whoNotFor ? (
                  <div className="space-y-1 text-sm">
                    {item.whoFor ? (
                      <p>
                        <span className="text-muted-foreground">For: </span>
                        {item.whoFor}
                      </p>
                    ) : null}
                    {item.whoNotFor ? (
                      <p>
                        <span className="text-muted-foreground">Not for: </span>
                        {item.whoNotFor}
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {item.testingNotes ? (
                  // Deliberately labelled as what it is. The brief is explicit that
                  // this never becomes a report or a statistic, and a reviewer who
                  // forgets that is the one place the rule could quietly break.
                  <div className="space-y-1">
                    <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Creator&rsquo;s own note &mdash; not a report, not counted anywhere
                    </h4>
                    <p className="text-sm text-muted-foreground">{item.testingNotes}</p>
                  </div>
                ) : null}

                {item.reviewerNote ? (
                  <p className="text-sm">
                    <span className="text-muted-foreground">Last note: </span>
                    {item.reviewerNote}
                  </p>
                ) : null}

                <div className="space-y-1.5">
                  <label htmlFor={`note-${item.playbookId}`} className="text-sm font-medium">
                    Note to the creator
                  </label>
                  <Textarea
                    id={`note-${item.playbookId}`}
                    rows={3}
                    value={notes[item.playbookId] ?? ""}
                    onChange={(event) =>
                      setNotes((current) => ({ ...current, [item.playbookId]: event.target.value }))
                    }
                    placeholder="What to change, or why not. Required unless you are approving."
                  />
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    disabled={pending}
                    onClick={() => decide(item.playbookId, "approve")}
                    data-testid="submission-approve"
                  >
                    Approve and publish
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() => decide(item.playbookId, "request_changes")}
                    data-testid="submission-request-changes"
                  >
                    Ask for changes
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => decide(item.playbookId, "reject")}
                    data-testid="submission-reject"
                  >
                    Reject
                  </Button>
                </div>
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}