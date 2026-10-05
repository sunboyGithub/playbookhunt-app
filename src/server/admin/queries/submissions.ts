import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";

/**
 * The review queue: what creators have submitted, and what a reviewer needs to
 * read to decide.
 *
 * ## Everything on one row, because a reviewer decides in one sitting
 *
 * A reviewer opens a submission, reads it, and either approves it or writes a
 * note. If the prompt, the inputs and the steps needed three requests and three
 * page transitions to assemble, the decision gets deferred — and an unreviewed
 * queue is the same as a queue that does not exist. So this is one query with the
 * version's content embedded, and the payload is flattened into plain strings
 * here rather than left as JSON for the component to unpack.
 *
 * ## Nothing about this touches ranking
 *
 * The brief's rule is that votes, feedback and reviews never affect ranking. This
 * query feeds a moderation queue and nothing else: no column it reads is read by
 * `public.search_playbooks`, and the one write that changes a public number —
 * approval setting `status = 'published'` — changes whether a playbook exists, not
 * how it is ordered against another.
 *
 * `reviewer_note` is a message to one creator. It is read here, shown to the
 * creator on `/me`, and never anywhere public.
 */

type AdminClient = Pick<SupabaseClient<Database>, "from">;

export type SubmissionRow = {
  playbookId: string;
  slug: string;
  title: string;
  promise: string;
  whoFor: string | null;
  whoNotFor: string | null;
  outcomeType: string;
  categoryName: string;
  submittedAt: string;
  reviewStatus: string;
  reviewerNote: string | null;
  submissionVersion: number;
  /** The creator's private note. Never public, never a report. */
  testingNotes: string | null;
  prompt: string;
  inputs: { key: string; label: string; type: string; required: boolean }[];
  steps: string[];
};

/** `playbook_versions.prompt_template` for a submission's current version. */
const SELECT = `
  id, slug, title, promise, who_for, who_not_for, outcome_type,
  categories!inner(name),
  current_version_id,
  playbook_submissions!inner(status, reviewer_note, version, submitted_at),
  playbook_agents(notes),
  playbook_versions!playbooks_current_version_fkey(
    prompt_template,
    playbook_inputs(key, label, type, required, sort),
    playbook_steps(body, sort)
  )
`;

type RawRow = {
  id: string;
  slug: string;
  title: string;
  promise: string;
  who_for: string | null;
  who_not_for: string | null;
  outcome_type: string;
  categories: { name: string } | null;
  playbook_submissions: {
    status: string;
    reviewer_note: string | null;
    version: number;
    submitted_at: string;
  }[] | null;
  playbook_agents: { notes: string | null }[] | null;
  playbook_versions: {
    prompt_template: string;
    playbook_inputs: { key: string; label: string; type: string; required: boolean; sort: number }[] | null;
    playbook_steps: { body: string; sort: number }[] | null;
  }[] | null;
};

/**
 * The queue, newest first.
 *
 * Only `in_review` and `changes_requested` by default. A rejected submission is
 * finished with and an approved one is on the site, so neither needs to be in the
 * list somebody works through — but both are reachable, because "why was this
 * turned down" is a question this page has to be able to answer.
 */
export async function listSubmissions(
  client: AdminClient,
  status: "queue" | "in_review" | "changes_requested" | "approved" | "rejected" = "queue",
): Promise<SubmissionRow[]> {
  const query = client
    .from("playbooks")
    .select(SELECT)
    .eq("status", "in_review")
    .not("current_version_id", "is", null)
    .order("updated_at", { ascending: false })
    .limit(50);

  const { data, error } = await query;

  if (error) {
    throw new Error(`listSubmissions: ${error.message}`);
  }

  const rows = (data ?? []) as unknown as RawRow[];

  return rows
    .map(flatten)
    .filter((row): row is SubmissionRow => row !== null)
    .filter((row) => (status === "queue" ? row.reviewStatus !== "rejected" : row.reviewStatus === status));
}

/** Counts for the filter tabs. One query, folded here rather than four. */
export async function countSubmissionsByStatus(client: AdminClient): Promise<Record<string, number>> {
  const { data, error } = await client
    .from("playbooks")
    .select("playbook_submissions(status)")
    .eq("status", "in_review");

  if (error) {
    throw new Error(`countSubmissionsByStatus: ${error.message}`);
  }

  const counts: Record<string, number> = {};

  for (const row of (data ?? []) as unknown as { playbook_submissions: { status: string }[] | null }[]) {
    for (const submission of row.playbook_submissions ?? []) {
      counts[submission.status] = (counts[submission.status] ?? 0) + 1;
    }
  }

  return counts;
}

function flatten(row: RawRow): SubmissionRow | null {
  const submission = row.playbook_submissions?.[0];
  const version = row.playbook_versions?.[0];

  if (!submission || !version) {
    // A playbook with no submission row is an imported one that happens to sit
    // at `in_review`, which no code path creates. Skipping rather than rendering
    // a row with nothing to decide keeps a data accident off the screen instead
    // of making it look like a queue item.
    return null;
  }

  return {
    playbookId: row.id,
    slug: row.slug,
    title: row.title,
    promise: row.promise,
    whoFor: row.who_for,
    whoNotFor: row.who_not_for,
    outcomeType: row.outcome_type,
    categoryName: row.categories?.name ?? "",
    submittedAt: submission.submitted_at,
    reviewStatus: submission.status,
    reviewerNote: submission.reviewer_note,
    submissionVersion: submission.version,
    // From `playbook_agents.notes`, deliberately. The creator writes "what result
    // did you get" and the brief forbids that becoming a report, a statistic or
    // site verification — so it lands in the column the admin reads and nowhere
    // else. `tested` beside it stays false until an administrator sets it.
    testingNotes: row.playbook_agents?.find((agent) => agent.notes !== null)?.notes ?? null,
    prompt: version.prompt_template,
    inputs: [...(version.playbook_inputs ?? [])]
      .sort((a, b) => a.sort - b.sort)
      .map((input) => ({
        key: input.key,
        label: input.label,
        type: input.type,
        required: input.required,
      })),
    steps: [...(version.playbook_steps ?? [])].sort((a, b) => a.sort - b.sort).map((step) => step.body),
  };
}