import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { REPORT_EDIT_WINDOW_HOURS } from "@/lib/report/shape";

/**
 * Everything `/me` needs, and the two awkward reads behind it.
 *
 * Both awkward reads use the service-role client, and both are worth reading
 * before changing.
 *
 * ## `try_events` has no client SELECT policy
 *
 * A try log is deliberately unreadable by the person who wrote it — the table
 * grants select to admins only, so an anonymous reader's activity is not
 * something they (or anyone) can enumerate. But "Tried" is a tab on a page that
 * is *about* one reader's activity, so the server has to read it on their
 * behalf.
 *
 * That is safe because `userId` is not a parameter here: it comes from the
 * verified session, so this can only ever return rows belonging to the caller.
 * Passing a user id in would turn it into an account-enumeration endpoint, which
 * is the reason the read lives in the server at all.
 *
 * ## The "tried but not reported" set
 *
 * A left join would be tidier, but it cannot be done through the RLS client for
 * the same reason, and doing it in the database would mean a view that has to
 * re-implement the "current version" rule — which is the one rule that decides
 * whether a report counts. So the set difference is done here, against ids both
 * reads returned, where the version rule is visible in the code that depends on
 * it.
 */

export type MePlaybook = {
  id: string;
  slug: string;
  title: string;
  promise: string;
  category: { slug: string; name: string };
  savedAt: string | null;
  triedAt: string | null;
  reportedAt: string | null;
  reportResult: "worked" | "partly" | "didnt" | null;
  /** Present only when this reader has a report on it — what delete takes. */
  reportId: string | null;
  /** True while the reader is still inside the 24-hour edit window. */
  reportEditable: boolean;
  hasEvidence: boolean;
  /**
   * The current version is newer than the one the reader saw.
   *
   * What Frame 9's "Updated since you saved" badge means: not "the page changed"
   * but "the thing you saved is not the thing you would get now". A version
   * that only fixed a typo still counts, because the reader deciding whether to
   * try it again is deciding on the current text.
   */
  updatedSinceSave: boolean;
  stats: {
    report_count: number | string | null;
    success_rate_raw: number | string | null;
    median_amount: number | string | null;
    amount_n: number | string | null;
  } | null;
};

export type MeLists = {
  saved: MePlaybook[];
  tried: MePlaybook[];
  reported: MePlaybook[];
  categories: { slug: string; name: string }[];
};

/** Playbooks shown on `/me`, keyed by id, from the readers's three lists. */
export async function listMePlaybooks(userId: string): Promise<MeLists> {
  const admin = createAdminClient();
  const supabase = await createClient();

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [saves, tries, reports] = await Promise.all([
    admin
      .from("saves")
      .select("playbook_id, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
    admin
      .from("try_events")
      .select("playbook_id, created_at")
      .eq("user_id", userId)
      .in("action", ["copied", "opened"])
      .order("created_at", { ascending: false }),
    admin
      .from("outcome_reports")
      .select("id, playbook_id, result, created_at, version_id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
  ]);

  // One row per playbook per list. The try log and the report log are both
  // append-only event streams, so without this the same playbook would appear
  // three times on one page.
  const savedAt = new Map<string, string>();
  for (const row of saves.data ?? []) {
    if (!savedAt.has(row.playbook_id)) savedAt.set(row.playbook_id, row.created_at);
  }

  const triedAt = new Map<string, string>();
  for (const row of tries.data ?? []) {
    if (!triedAt.has(row.playbook_id)) triedAt.set(row.playbook_id, row.created_at);
  }

  const reportedAt = new Map<string, string>();
  const reportedResult = new Map<string, "worked" | "partly" | "didnt">();
  for (const row of reports.data ?? []) {
    if (reportedAt.has(row.playbook_id)) continue;
    reportedAt.set(row.playbook_id, row.created_at);
    reportedResult.set(
      row.playbook_id,
      row.result as "worked" | "partly" | "didnt",
    );
  }

  const ids = [...new Set([...savedAt.keys(), ...triedAt.keys(), ...reportedAt.keys()])];

  if (ids.length === 0) {
    return { saved: [], tried: [], reported: [], categories: [] };
  }

  const { data: playbooks } = await supabase
    .from("playbooks")
    .select(
      "id, slug, title, promise, category:categories(slug, name), current_version_id, stats:playbook_stats(report_count, success_rate_raw, median_amount, amount_n)",
    )
    .in("id", ids)
    .eq("status", "published");

  const versionIds = (reports.data ?? []).map((row) => row.version_id).filter(Boolean) as string[];

  const { data: versions } = versionIds.length
    ? await supabase
        .from("playbook_versions")
        .select("id, playbook_id, created_at")
        .in("id", versionIds)
    : { data: [] };

  // The version a reader saw is not recorded on the save — that is the whole
  // problem the "Updated since you saved" badge is solving. What is available
  // is when the version was cut, compared to when they saved, which answers the
  // same question for the case that matters: a change made after the star was
  // clicked.
  const versionById = new Map((versions ?? []).map((row) => [row.id, row.created_at]));

  const editableReport = new Map<string, boolean>();
  for (const row of reports.data ?? []) {
    if (!editableReport.has(row.playbook_id)) {
      editableReport.set(row.playbook_id, row.created_at > since);
    }
  }

  // Evidence exists so the "you can still change this" copy can say so, and so
  // `/me` can show whether there is a file to delete. It is read through the RLS
  // client, not the admin one: `report_evidence` has a working owner-scoped
  // SELECT policy, and using the service role here would be reaching past a
  // guardrail for no reason.
  const reportIds = (reports.data ?? []).map((row) => row.id as string);
  const withEvidence = new Set<string>();

  if (reportIds.length > 0) {
    const { data: evidence } = await supabase
      .from("report_evidence")
      .select("report_id")
      .in("report_id", reportIds);

    for (const row of evidence ?? []) {
      withEvidence.add(row.report_id as string);
    }
  }

  const reportIdByPlaybook = new Map<string, string>();
  for (const row of reports.data ?? []) {
    if (!reportIdByPlaybook.has(row.playbook_id)) {
      reportIdByPlaybook.set(row.playbook_id, row.id as string);
    }
  }

  const rows: MePlaybook[] = (playbooks ?? []).map((playbook) => {
    const row = playbook as unknown as {
      id: string;
      slug: string;
      title: string;
      promise: string;
      current_version_id: string | null;
      category: { slug: string; name: string } | null;
      stats: MePlaybook["stats"];
    };

    const save = savedAt.get(row.id) ?? null;
    const reportVersion = (reports.data ?? []).find((r) => r.playbook_id === row.id)?.version_id;
    const versionCreated = reportVersion ? (versionById.get(reportVersion) ?? null) : null;

    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      promise: row.promise,
      category: row.category ?? { slug: "", name: "" },
      savedAt: save,
      triedAt: triedAt.get(row.id) ?? null,
      reportedAt: reportedAt.get(row.id) ?? null,
      reportResult: reportedResult.get(row.id) ?? null,
      reportId: reportIdByPlaybook.get(row.id) ?? null,
      reportEditable: editableReport.get(row.id) ?? false,
      hasEvidence: withEvidence.has(reportIdByPlaybook.get(row.id) ?? ""),
      updatedSinceSave: Boolean(save && versionCreated && versionCreated > save),
      stats: row.stats ?? null,
    };
  });

  const bySaved = (a: MePlaybook, b: MePlaybook) =>
    (b.savedAt ?? b.triedAt ?? b.reportedAt ?? "").localeCompare(
      a.savedAt ?? a.triedAt ?? a.reportedAt ?? "",
    );

  const categories = [
    ...new Map(rows.map((row) => [row.category.slug, row.category])).values(),
  ].sort((a, b) => a.name.localeCompare(b.name));

  return {
    saved: rows.filter((row) => row.savedAt).sort(bySaved),
    tried: rows.filter((row) => row.triedAt).sort(bySaved),
    reported: rows.filter((row) => row.reportedAt).sort(bySaved),
    categories,
  };
}

/**
 * The reader's own report on a playbook, shaped for the edit form.
 *
 * Read through the service role for the same reason the lists above are: the
 * `user_id` column has no client grant, so there is no RLS policy that could do
 * this job even in principle. The id comes from the session and is applied to the
 * query, never from the request — a `playbookId` is the only thing a caller gets
 * to choose, and choosing one can only ever surface a row that already belongs to
 * them.
 *
 * Returns the most recent report, because the unique index is per *version* and a
 * reader who reported on v1 and v2 has two rows. Editing the newest is the one
 * they can still edit; the older one is past its window anyway.
 */
export type EditableReport = {
  reportId: string;
  versionId: string;
  result: "worked" | "partly" | "didnt";
  amount: number | null;
  timeSpentBucket: string | null;
  provider: string | null;
  region: string | null;
  note: string | null;
  agentSlug: string | null;
  hasEvidence: boolean;
  /** False once the 24-hour window has closed; the delete path stays open. */
  editable: boolean;
};

export async function getReportForEdit(
  userId: string,
  playbookId: string,
): Promise<EditableReport | null> {
  const admin = createAdminClient();

  const { data: report } = await admin
    .from("outcome_reports")
    .select("id, version_id, result, amount, hours_saved, time_spent_bucket, provider, region, note, agent_id, created_at")
    .eq("user_id", userId)
    .eq("playbook_id", playbookId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!report) {
    return null;
  }

  const [{ data: evidence }, { data: agent }] = await Promise.all([
    admin
      .from("report_evidence")
      .select("id")
      .eq("report_id", report.id)
      .limit(1),
    report.agent_id
      ? admin.from("agents").select("slug").eq("id", report.agent_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const hours = report.hours_saved as number | null;

  return {
    reportId: report.id as string,
    versionId: report.version_id as string,
    result: report.result as "worked" | "partly" | "didnt",
    amount: (report.amount as number | null) ?? hours,
    timeSpentBucket: (report.time_spent_bucket as string | null) ?? null,
    provider: (report.provider as string | null) ?? null,
    region: (report.region as string | null) ?? null,
    note: (report.note as string | null) ?? null,
    agentSlug: (agent?.slug as string | null) ?? null,
    hasEvidence: (evidence ?? []).length > 0,
    editable:
      Date.parse(report.created_at as string) >
      Date.now() - REPORT_EDIT_WINDOW_HOURS * 3_600_000,
  };
}

/**
 * Whether this reader wants reminder emails.
 *
 * Its own query rather than a field on `Viewer`, because it is read on one page
 * and adding it to `Viewer` would put it in the root layout's read — a column
 * fetched on every request on the site for a setting nobody but `/me` shows.
 *
 * Defaults to true when the row cannot be read. The column's own default is
 * true, so "we don't know" and "they didn't opt out" are the same answer, and
 * guessing false would silently strand anybody whose profile row is missing.
 */
export async function getReminderPreference(userId: string): Promise<boolean> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("profiles")
    .select("reminders_enabled")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) {
    return true;
  }

  return (data as { reminders_enabled?: boolean }).reminders_enabled !== false;
}

/**
 * The agent the reader last used this playbook with.
 *
 * Falls back to null — which the form reads as "default to Muse" — because the
 * prefilled answer is a convenience and a stale one is worse than none.
 */
export async function lastTryAgentSlug(userId: string, playbookId: string): Promise<string | null> {
  const admin = createAdminClient();

  const { data } = await admin
    .from("try_events")
    .select("agent:agents(slug)")
    .eq("user_id", userId)
    .eq("playbook_id", playbookId)
    .not("agent_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const agent = (data as unknown as { agent?: { slug?: string } | null } | null)?.agent;
  return agent?.slug ?? null;
}