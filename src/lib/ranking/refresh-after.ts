import "server-only";

/**
 * The server-only entry point to the stats refresh, plus the failure policy the
 * report actions need.
 *
 * `refresh.ts` itself is deliberately *not* marked `server-only`: it takes a
 * Supabase client as a parameter, which is what lets the seed script call the
 * real aggregation under plain Node. This module is where the app binds that
 * parameter to the service-role client, so there is exactly one place that
 * reaches for elevated access and exactly one boundary a bundler can check.
 *
 * ## Why a failed refresh must not fail the reader's request
 *
 * A reader who files "it worked" must get their thank-you whether or not the
 * statistics recomputation succeeded — the report is already written, and
 * answering "sorry, something went wrong" about a *statistics* failure would
 * tell them their report was lost when it was not. So the refresh is wrapped,
 * logged, and allowed to fail; the cron's next run picks up whatever was missed.
 *
 * The alternative — letting the error propagate — is worse than it looks.
 * `submitReport` runs as a server action inside a React transition, so a throw
 * here would replace the form's success state with an error boundary *and* lose
 * the `nextSuggestion` the reader was about to be shown, on the strength of a
 * bad number in a table nobody is currently looking at.
 *
 * The page is revalidated either way, because the report list on it did change.
 * Only the evidence tiles wait for the stats row — and below 20 reports the
 * tiles are absent regardless, so the reader who would notice a stale number is
 * exactly the one whose numbers did not change enough to matter.
 */

import { refreshStats } from "@/lib/ranking/refresh";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Recompute one playbook's stats with the service-role client.
 *
 * Throws on failure — this is the raw call, for the cron and for the seed
 * script's own error handling. Use `refreshAfterReportChange` from a report
 * action.
 */
export async function refreshPlaybookStats(playbookId?: string) {
  return refreshStats(createAdminClient(), playbookId);
}

/** The whole catalogue. What the cron calls. */
export async function refreshAllStats() {
  return refreshStats(createAdminClient());
}

/**
 * Refresh one playbook's stats after a report changes, swallowing any failure.
 *
 * Returns whether it succeeded, so a caller that cares — a test — can tell the
 * difference between "computed" and "left for next time".
 */
export async function refreshAfterReportChange(playbookId: string): Promise<boolean> {
  try {
    await refreshPlaybookStats(playbookId);
    return true;
  } catch (error) {
    // The message has to name the playbook, because what goes wrong in practice
    // is a constraint rejecting a row for one playbook out of the catalogue, and
    // "refresh failed" without an id is not a bug report.
    console.error(
      `[stats] refresh failed for playbook ${playbookId}; the cron will retry —`,
      error instanceof Error ? error.message : error,
    );
    return false;
  }
}