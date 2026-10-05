import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";

/**
 * The evidence queue: files somebody attached to a report, waiting on a decision.
 *
 * ## Why this is a separate queue from the reports
 *
 * A moderator looking at "is this report plausible" and a moderator looking at
 * "is this file real" are asking different questions, and interleaving the two
 * makes both slower. The reports queue has a bulk action and a filter; this one
 * is a list of files to open, one at a time, each of which takes a decision.
 *
 * ## Why no signed URL appears here
 *
 * The storage path is resolved, but never the link. `createSignedUrl` is a
 * request, not a value, and minting one per row would put a hundred five-minute
 * bearer links in a page that is `force-dynamic` today and would be cached by
 * somebody's CDN tomorrow. The link is minted on demand for the file being looked
 * at — see `mintEvidenceUrl`.
 */

type AdminClient = Pick<SupabaseClient<Database>, "from" | "storage">;

export const EVIDENCE_STATUSES = ["pending", "approved", "rejected"] as const;
export type EvidenceStatus = (typeof EVIDENCE_STATUSES)[number];

export type EvidenceItem = {
  id: string;
  storagePath: string;
  kind: string;
  reviewStatus: EvidenceStatus;
  reviewNote: string | null;
  createdAt: string;
  report: {
    id: string;
    result: string;
    amount: number | null;
    unit: string | null;
    status: string;
    isVerified: boolean;
    evidenceReviewed: boolean;
    reporterName: string | null;
    note: string | null;
  };
  playbook: { id: string; slug: string; title: string };
};

/**
 * `playbooks` is reached *through* `outcome_reports`, not from `report_evidence`.
 *
 * `report_evidence` has exactly one foreign key and it points at
 * `outcome_reports`; the playbook is a second hop away. PostgREST only embeds
 * along declared keys, so `playbooks!inner(...)` at the top level is a PGRST200
 * ("no relationship found") and the whole page 500s — which is what happened
 * until the browser said so. Nesting it inside `outcome_reports!inner(...)`
 * follows the path that actually exists.
 */
const EVIDENCE_SELECT =
  "id, storage_path, kind, review_status, review_note, created_at, " +
  "outcome_reports!inner(id, result, amount, unit, status, is_verified, evidence_reviewed, note, " +
  "profiles!inner(display_name), " +
  "playbooks!inner(id, slug, title))";

type JoinedReport = {
  id: string;
  result: string;
  amount: number | null;
  unit: string | null;
  status: string;
  is_verified: boolean;
  evidence_reviewed: boolean;
  note: string | null;
  profiles: { display_name: string | null } | { display_name: string | null }[] | null;
  playbooks:
    | { id: string; slug: string; title: string }
    | { id: string; slug: string; title: string }[]
    | null;
};

type JoinedEvidence = {
  id: string;
  storage_path: string;
  kind: string;
  review_status: string;
  review_note: string | null;
  created_at: string;
  outcome_reports: JoinedReport | JoinedReport[] | null;
};

function one<T>(value: T | T[] | null): T | null {
  if (value === null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export async function listEvidence(
  client: AdminClient,
  status: EvidenceStatus = "pending",
  limit = 50,
): Promise<EvidenceItem[]> {
  const { data, error } = await client
    .from("report_evidence")
    .select(EVIDENCE_SELECT)
    .eq("review_status", status)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(`listEvidence: ${error.message}`);
  }

  return ((data ?? []) as unknown as JoinedEvidence[]).map((row) => {
    const report = one(row.outcome_reports);
    const playbook = one(report?.playbooks ?? null);
    const reporter = one(report?.profiles ?? null);

    return {
      id: row.id,
      storagePath: row.storage_path,
      kind: row.kind,
      reviewStatus: isEvidenceStatus(row.review_status) ? row.review_status : "pending",
      reviewNote: row.review_note,
      createdAt: row.created_at,
      report: {
        id: report?.id ?? "",
        result: report?.result ?? "",
        amount: report?.amount === null || report?.amount === undefined ? null : Number(report.amount),
        unit: report?.unit ?? null,
        status: report?.status ?? "",
        isVerified: report?.is_verified ?? false,
        evidenceReviewed: report?.evidence_reviewed ?? false,
        note: report?.note ?? null,
        reporterName: reporter?.display_name ?? null,
      },
      playbook: {
        id: playbook?.id ?? "",
        slug: playbook?.slug ?? "(removed)",
        title: playbook?.title ?? "Removed playbook",
      },
    };
  });
}

/**
 * A link to one file, good for `EVIDENCE_URL_TTL_SECONDS`.
 *
 * Minted per file on demand and never stored: the path is the durable thing, and
 * a stored link would keep pointing at a file after its review window closed.
 */
export async function mintEvidenceUrl(
  client: AdminClient,
  storagePath: string,
  ttlSeconds: number,
): Promise<string | null> {
  const { data, error } = await client.storage.from("evidence").createSignedUrl(storagePath, ttlSeconds);

  if (error) {
    throw new Error(`mintEvidenceUrl: ${error.message}`);
  }

  return data?.signedUrl ?? null;
}

function isEvidenceStatus(value: string): value is EvidenceStatus {
  return value === "pending" || value === "approved" || value === "rejected";
}