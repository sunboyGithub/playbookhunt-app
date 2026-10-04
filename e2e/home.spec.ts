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
