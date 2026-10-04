/**
 * Seed synthetic reports and stats, so the detail page can be inspected with
 * real numbers in it.
 *
 * The catalogue ships with three playbooks and no reports, which is the honest
 * state of a new product and the state every empty-state criterion is written
 * against. But it also means the bar, the median tile, the last-30 line and the
 * report list have never been *seen* rendering anything. This puts fixtures
 * there so they can be.
 *
 * The fixtures are clearly fake and clearly labelled:
 *
 * - Every report belongs to a profile whose display name is
 *   "Fixture reporter", so a populated page is obviously populated with
 *   fixtures rather than being mistaken for real evidence.
 * - Nothing here is a claim about anyone's finances. The amounts are round
 *   numbers chosen to land the median on a round figure, which is exactly the
 *   kind of number a real median never is.
 *
 * **Refuses to run outside local Supabase.** A fixture that can reach a
 * production database is a way to publish 40 fake "verified" reports on a
 * product whose entire claim is that its reports are real. The check is on the
 * URL rather than on an env flag, because the URL is the thing that decides
 * where the writes land.
 *
 * Run `pnpm db:reset` to remove them.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "../src/lib/database.types";
import { REPORT_THRESHOLD } from "../src/server/queries/types";

/**
 * Typed against the generated schema, like the app is. An untyped client here
 * would let a renamed column through silently, which for a script whose entire
 * job is writing plausible-looking rows is the wrong failure mode.
 */
type Db = SupabaseClient<Database>;

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`${name} is not set. Run with --env-file=.env.local`);
  }
  return value;
}

/**
 * How many reports to write per playbook, and what they should add up to.
 *
 * Chosen to straddle the two thresholds: `cheaper-car-insurance` and
 * `japan-trip` clear 20 reports so the bar, the rate and the median all render;
 * `internet-bill` deliberately stays under it so the Early state can be checked
 * on a page that also has data in it. A fixture set where everything clears
 * every bar cannot show the withholding working.
 */
const FIXTURES: {
  slug: string;
  reportCount: number;
  worked: number;
  partly: number;
  didnt: number;
  amount: number;
  amountEvery: number;
  triedCount: number;
}[] = [
  {
    slug: "cheaper-car-insurance",
    reportCount: 40,
    worked: 27,
    partly: 9,
    didnt: 4,
    amount: 310,
    amountEvery: 2, // Only half the reports carry an amount, so amount_n is 20.
    triedCount: 1180,
  },
  {
    slug: "plan-7-days-in-japan",
    reportCount: 24,
    worked: 14,
    partly: 7,
    didnt: 3,
    amount: 4, // hours saved, not money — outcome_type is time_hours.
    amountEvery: 1,
    triedCount: 640,
  },
  {
    slug: "lower-your-internet-bill",
    reportCount: 7,
    worked: 5,
    partly: 1,
    didnt: 1,
    amount: 22,
    amountEvery: 1,
    triedCount: 63,
  },
];

const PROVIDERS = ["Geico", "State Farm", "Allstate", "Progressive"];
const AGENT_SLUGS = ["muse", "muse", "muse", "chatgpt-dots"];

/**
 * Shared across every fixture profile so a populated page is unmistakably
 * populated with fixtures. Also the prefix the rerun lookup matches on.
 */
const FIXTURE_REPORTER_PREFIX = "Fixture reporter%";

function fixtureReporterName(index: number): string {
  return `Fixture reporter ${index}`;
}

/**
 * Stamped into each fixture email address so `createUser` can never collide with
 * an auth row left over from an earlier run.
 *
 * Reuse is keyed on the display name, not the address, so this is only ever
 * reached when the profile row is genuinely absent — which is exactly the case
 * where a fixed address would fail.
 */
const authRunId = Date.now().toString(36);

async function main() {
  const url = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");

  const host = new URL(url).hostname;
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(
      `Refusing to write fixtures to ${url}. These are synthetic reports on a site whose ` +
        `entire claim is that its reports are real; they belong on a local database only.`,
    );
  }

  const supabase: Db = createClient<Database>(url, serviceKey, {
    auth: { persistSession: false },
  });

  // One account per report, sized to the largest fixture. Created once rather
  // than per playbook, because `outcome_reports` is unique on
  // `(user_id, version_id)` — the same person may report each playbook once, so
  // the accounts are reusable across playbooks but never within one.
  const reporterIds = await fixtureReporters(
    supabase,
    Math.max(...FIXTURES.map((fixture) => fixture.reportCount)),
  );

  // Clean first, so the script is idempotent rather than additive. Rerunning it
  // should leave the database in the state it describes, not with two copies of
  // every fixture.
  for (const fixture of FIXTURES) {
    const { data: playbook } = await supabase
      .from("playbooks")
      .select("id, current_version_id, outcome_type")
      .eq("slug", fixture.slug)
      .maybeSingle();

    if (!playbook) {
      throw new Error(`no playbook with slug ${fixture.slug} — run pnpm content:import first`);
    }

    // `outcome_reports.version_id` is NOT NULL: a report is always about one
    // version of a playbook. A playbook with no current version therefore cannot
    // have reports at all, and writing `null` would fail at the database rather
    // than saying which playbook is broken.
    const versionId = playbook.current_version_id;
    if (!versionId) {
      throw new Error(`${fixture.slug} has no current version — run pnpm content:import first`);
    }

    const existing = await supabase
      .from("outcome_reports")
      .select("id")
      .eq("playbook_id", playbook.id);
    const staleIds = (existing.data ?? []).map((row) => row.id);
    if (staleIds.length > 0) {
      await supabase.from("outcome_reports").delete().in("id", staleIds);
    }

    // Resolved once, up front. `Array.from`'s mapper is synchronous, so an async
    // one would return promises and insert an array of them — which PostgREST
    // would reject in a way that reads as a schema problem rather than as the
    // mistake it is.
    const agentIds = await agentIdMap(supabase, AGENT_SLUGS);

    const isTimeOutcome = playbook.outcome_type === "time_hours";

    const reports = Array.from({ length: fixture.reportCount }, (_, index) => {
      // Deterministic rather than random: a fixture that renders differently on
      // every run cannot be used to check that anything looks the same.
      const result =
        index < fixture.worked
          ? "worked"
          : index < fixture.worked + fixture.partly
            ? "partly"
            : "didnt";

      const carriesAmount = index % fixture.amountEvery === 0;

      return {
        playbook_id: playbook.id,
        version_id: versionId,
        user_id: reporterIds[index % reporterIds.length]!,
        agent_id: agentIds.get(AGENT_SLUGS[index % AGENT_SLUGS.length]!) ?? null,
        result,
        amount: carriesAmount && !isTimeOutcome ? fixture.amount : null,
        unit: carriesAmount && !isTimeOutcome ? "/yr" : null,
        hours_saved: carriesAmount && isTimeOutcome ? fixture.amount : null,
        time_spent_bucket: ["lt15", "15_30", "30_60", "1_2h"][index % 4],
        provider: PROVIDERS[index % PROVIDERS.length],
        // Exactly one report carries both flags, so the "Verified" and
        // "Evidence reviewed" tags have a single place they can be seen rather
        // than appearing on every row where they would read as decoration.
        is_verified: index === 1,
        evidence_reviewed: index === 1,
        status: "approved",
      };
    });

    const { error: insertError } = await supabase.from("outcome_reports").insert(reports);
    if (insertError) {
      throw new Error(`inserting fixtures for ${fixture.slug}: ${insertError.message}`);
    }

    const amountN = reports.filter((report) => report.amount !== null || report.hours_saved !== null)
      .length;

    const { error: statsError } = await supabase.from("playbook_stats").upsert({
      playbook_id: playbook.id,
      tried_count: fixture.triedCount,
      report_count: fixture.reportCount,
      worked: fixture.worked,
      partly: fixture.partly,
      didnt: fixture.didnt,
      success_rate_raw: fixture.worked / fixture.reportCount,
      median_amount: fixture.amount,
      p25: Math.round(fixture.amount * 0.7),
      p75: Math.round(fixture.amount * 1.4),
      amount_n: amountN,
      last30_success: fixture.worked / fixture.reportCount,
      // Weighted evidence, so the related-playbooks ordering has something to
      // sort on rather than three equal scores.
      evidence_score: fixture.reportCount * (fixture.worked / fixture.reportCount) * 10,
      trending_score: 0,
      last_report_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    if (statsError) {
      throw new Error(`writing stats for ${fixture.slug}: ${statsError.message}`);
    }

    console.log(
      `  ${fixture.slug}: ${fixture.reportCount} reports, ${amountN} with amounts, ` +
        // The same threshold the page uses, not a fraction of the worked count.
        // An earlier version tested `worked / reportCount >= 0.2` and printed
        // "rate shows" for a playbook with 7 reports — a log line contradicting
        // the Early state the page was about to render.
        `${fixture.reportCount >= REPORT_THRESHOLD ? "rate shows" : "Early state"}`,
    );
  }

  console.log("\nFixtures written. `pnpm db:reset` removes them.");
}

/**
 * One fixture reporter per report, created on demand and reused on a rerun.
 *
 * `outcome_reports` is unique on `(user_id, version_id)`: a person may report a
 * given playbook version once. Forty reports therefore need forty accounts, not
 * one account reporting forty times — an earlier version of this script used a
 * single shared reporter and died on exactly that constraint.
 *
 * The names are numbered, so a populated page is still obviously populated with
 * fixtures rather than mistakable for real evidence, and so any single report can
 * be traced back to the account that filed it.
 */
async function fixtureReporters(supabase: Db, count: number): Promise<string[]> {
  const { data: existing } = await supabase
    .from("profiles")
    .select("id, display_name")
    .like("display_name", FIXTURE_REPORTER_PREFIX);

  const byName = new Map(
    (existing ?? []).map((row) => [row.display_name as string, row.id as string]),
  );

  const ids: string[] = [];

  for (let index = 1; index <= count; index += 1) {
    const displayName = fixtureReporterName(index);
    const found = byName.get(displayName);

    if (found) {
      ids.push(found);
      continue;
    }

    // The service role bypasses RLS, so this inserts the auth row too. A fixture
    // report whose user has no profile renders with the generic "A Playbook Hunt
    // member" name, because the view substitutes it — which would make the
    // fixtures look like they came from strangers.
    //
    // The `on_auth_user_created` trigger creates the `profiles` row from
    // `raw_user_meta_data ->> 'display_name'`, which is why `display_name` goes
    // in the metadata rather than into an insert here. An earlier version of
    // this function inserted the profile itself and died on the primary key —
    // the trigger had already made the row.
    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email: `fixture-${index}-${authRunId}@example.invalid`,
      email_confirm: true,
      user_metadata: { display_name: displayName },
    });

    if (authError || !authUser.user) {
      throw new Error(`creating ${displayName}: ${authError?.message ?? "no user returned"}`);
    }

    ids.push(authUser.user.id);
  }

  return ids;
}

/** Slugs to ids, resolved once for the whole fixture run. */
async function agentIdMap(
  supabase: Db,
  slugs: readonly string[],
): Promise<Map<string, string>> {
  const { data, error } = await supabase.from("agents").select("id, slug").in("slug", [...slugs]);

  if (error) {
    throw new Error(`resolving agent ids: ${error.message}`);
  }

  return new Map((data ?? []).map((row) => [row.slug as string, row.id as string]));
}

await main();