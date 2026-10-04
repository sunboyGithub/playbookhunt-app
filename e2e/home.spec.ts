import { expect, test } from "@playwright/test";

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

test("shows early evidence, not a percentage, with no reports", async ({ page }) => {
  await page.goto("/");

  // The seeded catalogue has three playbooks and no reports. AGENTS.md forbids a
  // success percentage below 20 reports, so the page must be showing "Early"
  // wording and no percentage at all — this fails loudly if a threshold is ever
  // bypassed rather than quietly rendering "0% worked".
  await expect(page.getByText(/Early · \d+ reports/).first()).toBeVisible();
  await expect(page.getByText(/^\d+% worked$/).first()).toHaveCount(0);
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
  await page.goto("/");

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
  await page.goto("/");
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