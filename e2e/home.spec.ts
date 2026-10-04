import { expect, test } from "@playwright/test";

import { reportCountsBySlug } from "./support/db";
import { REPORT_THRESHOLD } from "../src/server/queries/types";

test("homepage loads and renders the shared shell", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle(/Playbook Hunt/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  // Shared header and footer are present on every page.
  await expect(page.getByRole("link", { name: "Playbook Hunt" })).toBeVisible();
  await expect(page.getByRole("contentinfo")).toBeVisible();
});

test("footer links are reachable", async ({ page }) => {
  await page.goto("/");

  const footer = page.getByRole("contentinfo");
  for (const label of ["How we verify", "Request", "Create", "Privacy", "Terms"]) {
    await expect(footer.getByRole("link", { name: label })).toBeVisible();
  }
});

/**
 * Guards against a class of bug that is invisible to the other tests here: a
 * hydration mismatch. A mismatch only reports itself as a console error, so a
 * green run proves nothing about one unless we assert the console is clean.
 *
 * This also documents why developer machines look worse than CI. Browser
 * extensions rewrite the DOM before React hydrates — Google Bisect adds
 * `bis_*` attributes, among others — and Next.js lists that as a cause of
 * hydration errors. Playwright loads no extensions, so this test sees the
 * application as it actually ships.
 */
test("renders with no console errors or hydration warnings", async ({ page }) => {
  const problems: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      problems.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));

  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  expect(problems).toEqual([]);
});

test("shows a percentage only for a playbook with enough reports", async ({ page }) => {
  await page.goto("/");

  // The rule is per-playbook, so the test is per-playbook. An earlier version
  // asserted "no percentage anywhere on the homepage", which was true only
  // while nothing had been seeded — and stopped being true, correctly, the moment
  // `pnpm db:seed-stats` gave a playbook 40 reports. Asserting globally would
  // have meant deleting the fixtures to keep a test green, which is the wrong
  // trade: the state with reports is the state the product ships in.
  //
  // `lower-your-internet-bill` is the below-threshold case (7 reports with
  // fixtures, 0 without), so it is below the line either way.
  const belowThreshold = page
    .getByTestId("playbook-card")
    .filter({ hasText: "Lower your internet bill" })
    .first();

  await expect(belowThreshold).toBeVisible();
  await expect(belowThreshold.getByText(/^\d+% worked$/)).toHaveCount(0);
  await expect(belowThreshold.getByText(/Early · \d+ reports/)).toBeVisible();

  // The converse, so the rule is not satisfied by never publishing anything.
  // Only assertable when fixtures exist; skipped rather than faked otherwise.
  const counts = await reportCountsBySlug(["cheaper-car-insurance"]);
  if ((counts.get("cheaper-car-insurance") ?? 0) >= REPORT_THRESHOLD) {
    const aboveThreshold = page
      .getByTestId("playbook-card")
      .filter({ hasText: "Cheaper car insurance" })
      .first();

    await expect(aboveThreshold.getByText(/^\d+% worked$/)).toBeVisible();
  }
});

test("search submits to /search?q=", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("searchbox", { name: "Search playbooks" }).fill("internet bill");
  // `exact` because the header's ⌘K trigger is also named "Search playbooks",
  // and without it this resolves to two buttons and Playwright refuses to guess.
  await page.getByRole("button", { name: "Search", exact: true }).click();

  await expect(page).toHaveURL(/\/search\?q=internet\+bill|\/search\?q=internet%20bill/);
});

test("⌘K opens the palette and navigates to a playbook", async ({ page }) => {
  // `networkidle` rather than the default `load`. The shortcut is bound in a
  // `useEffect`, so it does not exist until hydration, and `keyboard.press`
  // has nothing to wait for — unlike a click, which Playwright holds until the
  // element is actionable. On a plain `load` the keypress can land first and be
  // dropped, which is a race in the test rather than a defect in the page: a
  // person cannot press ⌘K sooner than the page finishes loading.
  await page.goto("/", { waitUntil: "networkidle" });

  // `ControlOrMeta` is Playwright's platform modifier — "MetaOrControl" is not a
  // key it knows, and resolves to nothing.
  await page.keyboard.press("ControlOrMeta+k");

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  await dialog.getByRole("combobox").fill("internet");
  await dialog.getByRole("option", { name: /Lower your internet bill/ }).click();

  await expect(page).toHaveURL(/\/p\/lower-your-internet-bill/);
});

test("⌘K lists categories and quick actions at rest", async ({ page }) => {
  // Same hydration wait as the palette test above, for the same reason.
  await page.goto("/", { waitUntil: "networkidle" });
  await page.keyboard.press("ControlOrMeta+k");

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Personal finance")).toBeVisible();
  await expect(dialog.getByText("Report a result")).toBeVisible();
  await expect(dialog.getByText("Request a playbook")).toBeVisible();
});

test("the palette trigger in the header opens the palette", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Search playbooks/ }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
});