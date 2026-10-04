import { expect, test, type Page } from "@playwright/test";

/**
 * Navigation regression: the current page must stay on screen until the
 * destination is actually ready.
 *
 * The failure this catches is subtle and easy to ship. When a route suspends,
 * React will happily unmount the old tree and show nothing — or a root
 * `loading.tsx` skeleton — for as long as the fetch takes. On a fast connection
 * that gap is a single frame and nobody notices; on a slow one the reader is
 * looking at a blank page. Deliberately delaying the destination response makes
 * the gap long enough to assert on.
 *
 * The check runs against a production build, not the dev server. Dev renders
 * every module on demand, so timings there say nothing about what ships.
 */

const DESTINATIONS = [
  { name: "Playbooks", href: "/playbooks" },
  { name: "Starter kits", href: "/kits" },
  { name: "Categories", href: "/categories" },
] as const;

/** Something distinctive on the homepage, used as the "old page" marker. */
const HOMEPAGE_MARKER = "What do you want";

/**
 * Delay every request for `path` by `ms`, then let it through.
 *
 * Both the document and the RSC payload, because a `<Link>` click in the App
 * Router is a client-side navigation: no document is ever requested, so
 * intercepting only documents made this a no-op and the destination rendered as
 * fast as the local server could manage. The RSC payload is what React actually
 * waits on, and React keeps the current page on screen until it arrives — so
 * delaying that is precisely the window this spec is trying to measure.
 *
 * Images, scripts and styles fall through, since holding those back would just
 * produce a differently-shaped blank page.
 */
async function delayRoute(page: Page, path: string, ms: number) {
  await page.route(`**${path}**`, async (route) => {
    const type = route.request().resourceType();
    if (type !== "document" && type !== "fetch") {
      await route.fallback();
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, ms));
    await route.continue();
  });
}

/**
 * Click a destination in whichever nav the current viewport actually shows.
 *
 * The desktop links live in `nav[aria-label="Main"]`, which is `hidden md:flex`
 * — at mobile widths that landmark exists in the DOM but has no layout box, so
 * clicking it waits forever. Mobile users get the same links inside the sheet,
 * behind the hamburger, so that is what this opens first.
 */
async function clickNavLink(page: Page, name: string) {
  const mainNav = page.getByRole("navigation", { name: "Main" });

  if (await mainNav.isVisible()) {
    await mainNav.getByRole("link", { name, exact: true }).click();
    return;
  }

  await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("dialog").getByRole("link", { name, exact: true }).click();
}

const runsAgainstProd = process.env.E2E_TARGET === "prod";

test.describe("navigation keeps the current page visible", () => {
  // Skipped rather than run-and-ignored on the dev server. Dev compiles modules
  // on demand, so the gap this measures is dominated by compile time and says
  // nothing about what ships — a pass here would be evidence about the wrong
  // thing, which is worse than no result.
  test.skip(
    !runsAgainstProd,
    "requires E2E_TARGET=prod; run `pnpm test:e2e:prod`",
  );
  for (const destination of DESTINATIONS) {
    test(`homepage → ${destination.name}`, async ({ page }) => {
      await page.goto("/");
      await expect(page.getByRole("heading", { name: new RegExp(HOMEPAGE_MARKER) })).toBeVisible();

      await delayRoute(page, destination.href, 1200);

      await clickNavLink(page, destination.name);

      // Mid-flight: the old page is still there, not a blank body and not a
      // skeleton. Asserted several times across the delay, because a single
      // check could land in a lucky frame.
      for (let attempt = 0; attempt < 4; attempt += 1) {
        await page.waitForTimeout(200);
        await expect(page.getByRole("heading", { name: new RegExp(HOMEPAGE_MARKER) })).toBeVisible();
        await expect(page.locator("body")).not.toBeEmpty();
      }

      // And after the destination resolves, the new page is what is shown.
      await expect(page).toHaveURL(new RegExp(`${destination.href}$`));
      await expect(page.getByRole("heading", { name: new RegExp(HOMEPAGE_MARKER) })).toHaveCount(0);
    });
  }

  test("returning home via the logo", async ({ page }) => {
    await page.goto("/playbooks");
    await delayRoute(page, "/", 1200);

    await page.getByRole("link", { name: "Playbook Hunt" }).click();

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await page.waitForTimeout(200);
      // The playbooks page heading stays up while home is still loading.
      await expect(page.locator("main")).not.toBeEmpty();
    }

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { name: new RegExp(HOMEPAGE_MARKER) })).toBeVisible();
  });
});