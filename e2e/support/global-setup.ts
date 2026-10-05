import { clearPromotedAdmins } from "./admin";

/**
 * Once per test run, before any worker starts.
 *
 * This started as a `test.beforeAll` in `admin.spec.ts`, which was wrong in a
 * way worth recording. `beforeAll` runs once per *worker*, and the config sets
 * `fullyParallel: true`, so a run of eight tests across five workers invoked it
 * five times. A worker that started late ran the sweep while its four siblings
 * were mid-test — demoting the accounts they had just promoted, seconds before
 * they navigated to `/admin`. The symptom was two tests failing with an empty
 * report queue or a missing dashboard, on a run where every test passes with
 * `--workers=1`, which reads exactly like a product bug and is not one.
 *
 * `globalSetup` is the only hook with the right cardinality: once per run, and
 * finished before the first worker starts, so there is no window in which it can
 * reach an account another worker is using.
 *
 * The sweep itself lives in `clearPromotedAdmins`, which takes the database lock
 * around its own write; this file is only about when it runs.
 */
export default async function globalSetup(): Promise<void> {
  const cleared = await clearPromotedAdmins();

  if (cleared > 0) {
    console.log(
      `\n[e2e] demoted ${cleared} administrator(s) left behind by an earlier run. ` +
        `Those are accounts an e2e test promoted and never got to clean up.\n`,
    );
  }
}