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
