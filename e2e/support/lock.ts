import { mkdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * An exclusive lock across Playwright *processes*, for tests that mutate shared
 * database rows.
 *
 * `test.describe.configure({ mode: "serial" })` does not do this job. Serial
 * mode orders tests within one file in one worker; Playwright still runs the
 * `desktop` and `mobile` projects concurrently, in different processes, against
 * one database. A test that pins `playbook_stats.evidence_score` and a test in
 * the other project that pins the same two rows to different values will
 * overwrite each other mid-request, and each will read the other's numbers.
 *
 * That is not flakiness to be retried away — it is a test that cannot pass and
 * cannot be made to. `mkdir` is the primitive because it is atomic on every
 * filesystem this runs on, including the network mounts CI uses, where
 * `open(…, "wx")` and `link()` have historically been less reliable.
 *
 * Stale locks are reclaimed after `STALE_MS`, because a worker killed mid-test
 * would otherwise block every later run until someone noticed and deleted a
 * file in `/tmp`. The window is generous enough not to steal a lock from a slow
 * but live test.
 */

const LOCK_DIR = join(tmpdir(), "playbookhunt-e2e-db-lock");

const STALE_MS = 60_000;
const POLL_MS = 100;
const MAX_WAIT_MS = 25_000;

/** Whether a lock's owner is gone, or has simply been slow. */
function isStale(lockPath: string): boolean {
  try {
    return Date.now() - statSync(lockPath).mtimeMs > STALE_MS;
  } catch {
    // The lock vanished between the failed `mkdir` and here, which means another
    // process released it. Not stale — just not ours.
    return false;
  }
}

/**
 * Run `body` with the database lock held.
 *
 * Always releases, including on failure, and the release is scoped to the
 * directory this call created — so a lock that went stale and was taken by
 * somebody else is not deleted out from under them on the way out.
 */
export async function withDbLock<T>(body: () => Promise<T>): Promise<T> {
  const deadline = Date.now() + MAX_WAIT_MS;

  for (;;) {
    try {
      mkdirSync(LOCK_DIR);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;

      if (isStale(LOCK_DIR)) {
        // Best effort: if another process wins the reclaim between the check and
        // here, the next `mkdir` fails again and the loop simply tries again.
        rmSync(LOCK_DIR, { recursive: true, force: true });
        continue;
      }

      if (Date.now() > deadline) {
        throw new Error(
          `waited ${MAX_WAIT_MS}ms for the e2e database lock and gave up. ` +
            `If no other run is in progress, delete ${LOCK_DIR}`,
        );
      }

      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    }
  }

  try {
    return await body();
  } finally {
    rmSync(LOCK_DIR, { recursive: true, force: true });
  }
}