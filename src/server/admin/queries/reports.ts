import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";

/**
 * The moderation queue: reports, newest first, with the filters the brief asks
 * for.
 *
 * ## Why the reporter is resolved in a second pass
 *
 * The reporter's address lives in `auth.users`, not in `profiles` — and it has
 * to, because `profiles` is readable by everyone. Putting an address there to
 * make this join easier would publish every reader's email to the internet.
 *
 * So the join brings back the profile (display name, join date) and the addresses
 * are resolved separately, in one page of the admin API rather than one call per
 * row. A reporter whose row cannot be resolved gets no address: a blank is
 * honest, and a wrong address is worse than nothing.
 *
 * ## Why the reporter is shown at all
 *
 * A rejection is a judgement about one person's account, and somebody has to be
 * able to reach them about it — the public report view deliberately cannot. The
 * queue is also why the moderation note exists: a moderator who cannot see who
 * filed a report, and cannot write down why they threw it out, moderates worse
 * than somebody who can do both.
 *
 * ## Why there is a cap, and why the page says so
 *
 * The newest `REPORT_PAGE_SIZE` rows, with the true total alongside. A queue that
 * silently showed the first hundred of four hundred would be worse than a queue
 * with good filters, because the moderator would reasonably believe they had seen
 * everything. The count is on the page for the same reason it is on the
 * dashboard.
 */

export const REPORT_PAGE_SIZE = 100;

/** One page of the auth API, which is also its maximum. */
const AUTH_PAGE_SIZE = 1_000;

type AdminClient = Pick<SupabaseClient<Database>, "from" | "auth">;

export const REPORT_STATUSES = ["pending", "approved", "rejected"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const EVIDENCE_FILTERS = ["any", "pending", "reviewed"] as const;
export type EvidenceFilter = (typeof EVIDENCE_FILTERS)[number];

export type ReportFilters = {
  /** Omitted means every status, which is the queue's default view. */
  status?: ReportStatus;
  /** `true` shows only reports an administrator flagged as implausible. */
  outlier?: boolean;
  /** `pending` shows reports whose attached evidence is waiting for a decision. */
  evidence?: EvidenceFilter;
  playbookId?: string;
};

export type AdminReport = {
  id: string;
  result: string;
  amount: number | null;
  unit: string | null;
  hoursSaved: number | null;
  note: string | null;
  status: ReportStatus;
  isVerified: boolean;
  isOutlier: boolean;
  evidenceReviewed: boolean;
  moderationNote: string | null;
  createdAt: string;
  playbook: { id: string; slug: string; title: string };
  reporter: { id: string; name: string | null; email: string; joinedAt: string };
  evidence: { id: string; kind: string; reviewStatus: string; storagePath: string }[];
};

export type ReportQueue = {
  reports: AdminReport[];
  /** The rows matching the filters, which is not the rows on screen. */
  total: number;
};

/**
 * `as const` is load-bearing, not decoration: Supabase's generated types parse the
 * select *string* at the type level, and a `const` widened to `string` collapses
 * every column into `GenericStringError` — an error that reads like a database
 * problem and is really a missing keyword.
 *
 * The foreign keys are spelled out because these tables have more than one
 * relationship to some of the others, and an ambiguous embed resolves to nothing
 * at all rather than raising.
 */
const REPORT_SELECT = `
  id, playbook_id, user_id, result, amount, unit, hours_saved, note, status,
  is_verified, is_outlier, evidence_reviewed, moderation_note, created_at,
  playbooks!outcome_reports_playbook_id_fkey ( id, slug, title ),
  profiles!outcome_reports_user_id_fkey ( display_name, created_at ),
  report_evidence!report_evidence_report_id_fkey ( id, kind, review_status, storage_path )
` as const;

function isReportStatus(value: string | null | undefined): value is ReportStatus {
  return value === "pending" || value === "approved" || value === "rejected";
}

function isEvidenceFilter(value: string | null | undefined): value is EvidenceFilter {
  return value === "any" || value === "pending" || value === "reviewed";
}

/**
 * Build the query once, then run it twice — once for the rows, once for the count.
 *
 * The filters are applied in one function so both runs agree; Supabase's builder
 * is a mutable chain with no `.clone()`, so "run it twice" means "build it twice".
 */
function buildQuery(client: AdminClient, filters: ReportFilters, count: boolean) {
  let query = client
    .from("outcome_reports")
    .select(REPORT_SELECT, count ? { count: "exact" } : undefined)
    .order("created_at", { ascending: false });

  if (isReportStatus(filters.status)) {
    query = query.eq("status", filters.status);
  }
  if (filters.outlier) {
    query = query.eq("is_outlier", true);
  }
  if (filters.playbookId) {
    query = query.eq("playbook_id", filters.playbookId);
  }
  if (isEvidenceFilter(filters.evidence) && filters.evidence !== "any") {
    // Two questions with two different answers, so two different columns.
    //
    // "Pending" is the state of a *file* — `report_evidence.review_status` — and
    // filtering on it means "reports somebody attached something to that nobody
    // has looked at yet". "Reviewed" is `outcome_reports.evidence_reviewed`,
    // which is the denormalised fact the *public* page reads; it is denormalised
    // because the public page has no access to the evidence table at all (see
    // migration 06) and there is no policy it could be given without opening
    // every uploaded screenshot to the internet.
    if (filters.evidence === "pending") {
      query = query.eq("report_evidence.review_status", "pending");
    } else {
      query = query.eq("evidence_reviewed", true);
    }
  }

  return query.limit(REPORT_PAGE_SIZE);
}

/** The generated types widen embedded one-to-one relations to arrays, and PostgREST
 *  can return either shape depending on version, so the row is read through this
 *  rather than through the query's inferred type. */
type JoinedReport = {
  id: string;
  playbook_id: string;
  user_id: string;
  result: string;
  amount: number | null;
  unit: string | null;
  hours_saved: number | null;
  note: string | null;
  status: string;
  is_verified: boolean;
  is_outlier: boolean;
  evidence_reviewed: boolean;
  moderation_note: string | null;
  created_at: string;
  playbooks:
    | { id: string; slug: string; title: string }
    | { id: string; slug: string; title: string }[]
    | null;
  profiles:
    | { display_name: string | null; created_at: string }
    | { display_name: string | null; created_at: string }[]
    | null;
  report_evidence:
    | { id: string; kind: string; review_status: string; storage_path: string }[]
    | null;
};

export async function listReports(
  client: AdminClient,
  filters: ReportFilters = {},
): Promise<ReportQueue> {
  const { data, error, count } = await buildQuery(client, filters, true);

  if (error) {
    throw new Error(`listReports: ${error.message}`);
  }

  const rows = (data ?? []) as unknown as JoinedReport[];
  const reports = await withReporterAddresses(client, rows.map(toAdminReport));

  return { reports, total: count ?? 0 };
}

/**
 * One report, for the queue's own detail panel.
 *
 * The first row rather than `maybeSingle`, because the queue and the panel are
 * two separate requests and a report deleted between them is an ordinary race —
 * it should read as "gone" rather than as a failed page.
 */
export async function getReport(client: AdminClient, id: string): Promise<AdminReport | null> {
  const { data, error } = await buildQuery(client, {}, false).eq("id", id);

  if (error) {
    throw new Error(`getReport: ${error.message}`);
  }

  const row = (data ?? [])[0] as unknown as JoinedReport | undefined;
  if (!row) {
    return null;
  }

  const [report] = await withReporterAddresses(client, [toAdminReport(row)]);
  return report ?? null;
}

/**
 * Fill in the addresses, for the reporters on this page only.
 *
 * One page of the admin API per call. That is a real limitation and a documented
 * one: past a thousand accounts a reporter on the hundred-and-first page would
 * come back with no address, which shows as a blank rather than as somebody
 * else's. The alternative is a per-row lookup, which is worse at every size.
 */
async function withReporterAddresses(
  client: AdminClient,
  reports: AdminReport[],
): Promise<AdminReport[]> {
  if (reports.length === 0) {
    return reports;
  }

  const emails = await adminEmails(client);

  return reports.map((report) =>
    emails.has(report.reporter.id)
      ? { ...report, reporter: { ...report.reporter, email: emails.get(report.reporter.id)! } }
      : report,
  );
}

/**
 * Address → id for the site's accounts, one page of them.
 *
 * Reached through the caller's client rather than by building a second one: the
 * admin action already holds a service-role client, and a second credential for
 * one lookup is one more thing to leak.
 */
async function adminEmails(client: AdminClient): Promise<Map<string, string>> {
  const { data, error } = await client.auth.admin.listUsers({
    page: 1,
    perPage: AUTH_PAGE_SIZE,
  });

  if (error) {
    throw new Error(`listReports: reading account addresses — ${error.message}`);
  }

  return new Map(
    (data?.users ?? []).flatMap((user) => (user.email ? [[user.id, user.email] as const] : [])),
  );
}

/** Embedded one-to-one joins widen to arrays in the generated types. */
function one<T>(value: T | T[] | null): T | null {
  if (value === null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function toAdminReport(row: JoinedReport): AdminReport {
  const playbook = one(row.playbooks);
  const profile = one(row.profiles);

  return {
    id: row.id,
    result: row.result,
    amount: row.amount === null ? null : Number(row.amount),
    unit: row.unit,
    hoursSaved: row.hours_saved === null ? null : Number(row.hours_saved),
    note: row.note,
    status: isReportStatus(row.status) ? row.status : "approved",
    isVerified: row.is_verified,
    isOutlier: row.is_outlier,
    evidenceReviewed: row.evidence_reviewed,
    moderationNote: row.moderation_note,
    createdAt: row.created_at,
    playbook: {
      id: playbook?.id ?? row.playbook_id,
      slug: playbook?.slug ?? "(removed)",
      title: playbook?.title ?? "Removed playbook",
    },
    reporter: {
      id: row.user_id,
      name: profile?.display_name ?? null,
      // Filled by `withReporterAddresses`, which is the only thing that may read
      // an address. A blank here means "not resolved", and the queue renders it
      // as a dash rather than as a mail link that goes nowhere.
      email: "",
      joinedAt: profile?.created_at ?? "",
    },
    evidence: (row.report_evidence ?? []).map((item) => ({
      id: item.id,
      kind: item.kind,
      reviewStatus: item.review_status,
      storagePath: item.storage_path,
    })),
  };
}