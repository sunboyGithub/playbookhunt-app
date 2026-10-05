import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PORT ?? 3000);
const baseURL = `http://localhost:${PORT}`;

/**
 * `E2E_TARGET=prod` serves the suite from a production build instead of the dev
 * server. The navigation-regression spec requires it: dev compiles modules on
 * demand, so its timings describe the dev server rather than what ships, and
 * the blank-page flash it looks for is exactly the kind of thing that only
 * appears in a real build.
 *
 * `reuseExistingServer` is off in prod mode — silently testing a stale build
 * against fresh specs is worse than failing to start.
 */
const useProdBuild = process.env.E2E_TARGET === "prod";

/**
 * The admin spec runs last, and alone.
 *
 * `admin.spec.ts` moderates a real report on `lower-your-internet-bill` through
 * the UI. Moderating recomputes that playbook's statistics, and
 * `playbook-detail.spec.ts` and `me-and-report.spec.ts` assert on those exact
 * figures — so running them at the same time means one spec changes the numbers
 * another spec is in the middle of reading. The suite passes when the admin spec
 * runs on its own and fails three tests when everything runs together, which is
 * the worst possible shape: a failure that depends on scheduling.
 *
 * `withDbLock` cannot fix this. It serialises the suite's *direct* database
 * writes, and the mutation here arrives through a server action triggered by a
 * click in a browser — it never touches the lock, and there is nowhere sensible
 * for a test to hold a process-wide lock around a page load anyway.
 *
 * Playwright's project `dependencies` is the mechanism that fits: these two
 * projects wait for `desktop` and `mobile` to finish before starting. The other
 * specs therefore always see the fixtures in their seeded state, and the admin
 * spec always runs against a quiet database.
 */
const ADMIN_SPEC = /admin\.spec\.ts/;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "html",
  // Once per run, before the first worker. Anything that has to happen exactly
  // once belongs here and not in `beforeAll`, which runs per worker — see the
  // comment in `e2e/support/global-setup.ts`.
  globalSetup: "./e2e/support/global-setup.ts",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "desktop",
      testIgnore: ADMIN_SPEC,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      // AGENTS.md requires a 390x844 check on every UI prompt; the iPhone 13
      // descriptor is exactly that viewport.
      name: "mobile",
      testIgnore: ADMIN_SPEC,
      use: { ...devices["iPhone 13"] },
    },
    {
      name: "admin-desktop",
      testMatch: ADMIN_SPEC,
      dependencies: ["desktop", "mobile"],
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "admin-mobile",
      testMatch: ADMIN_SPEC,
      dependencies: ["desktop", "mobile"],
      use: { ...devices["iPhone 13"] },
    },
  ],
  webServer: {
    command: useProdBuild ? "pnpm build && pnpm start" : "pnpm dev",
    url: baseURL,
    reuseExistingServer: !process.env.CI && !useProdBuild,
    timeout: useProdBuild ? 300_000 : 120_000,
  },
});
