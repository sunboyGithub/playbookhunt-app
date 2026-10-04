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

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "html",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      // AGENTS.md requires a 390x844 check on every UI prompt; the iPhone 13
      // descriptor is exactly that viewport.
      name: "mobile",
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
