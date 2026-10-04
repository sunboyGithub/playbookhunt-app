import { expect, test } from "@playwright/test";

/**
 * Search acceptance, end to end.
 *
 * These are the queries the brief names, asserted through the UI rather than
 * against the database. A unit test can prove the synonym map is correct; only
 * this can prove that a person typing "insurence" gets a result, which is the
 * thing actually promised.
 *
 * Every case ends on a *named* playbook rather than on a count, because a count
 * can be right for the wrong reason — a search returning the right number of
 * unrelated rows passes a count assertion and fails the reader.
 */

/** The catalogue has three published playbooks; these are their titles. */
const TITLES = {
  internet: "Lower your internet bill",
  // Read from the YAML, not guessed: the seeded title is "Find cheaper car
  // insurance". A wrong constant here would have failed as a search failure
  // and sent me looking in the ranking code for a bug that was in the test.
  insurance: "Find cheaper car insurance",
  japan: "Plan seven days in Japan",
} as const;

/**
 * Navigate the way the app expects to be driven.
 *
 * `networkidle` is the point of this helper rather than an incidental default.
 * Next.js streams server-rendered HTML and hydrates afterwards, so a control can
 * be on screen and accept clicks a moment before React has attached its
 * handler. Clicking in that window succeeds and does nothing at all — no error,
 * no navigation — which is the hardest kind of test failure to read, because the
 * only evidence is some later assertion failing for an unrelated-looking reason.
 */
async function gotoPage(page: import("@playwright/test").Page, path: string) {
  await page.goto(path, { waitUntil: "networkidle" });
}

async function search(page: import("@playwright/test").Page, query: string) {
  await gotoPage(page, `/search?q=${encodeURIComponent(query)}`);
}

/**
 * Make the filter facets reachable, on whichever form this viewport has.
 *
 * Below `lg` the sidebar is hidden and the same `FilterPanel` sits in a bottom
 * sheet behind one button, so a test that clicks a category has to open that
 * first. The branch is on viewport width rather than on `isVisible()`, because
 * `isVisible()` does not retry — it returns whatever is true at that instant,
 * which before hydration is "no such button", and the test then times out on a
 * sheet that was never opened.
 */
async function openFacets(page: import("@playwright/test").Page) {
  if ((page.viewportSize()?.width ?? 0) >= 1024) {
    return;
  }

  const trigger = page.getByRole("button", { name: /^Filters/ });
  const sheet = page.locator('[role="dialog"]');

  // Retried rather than clicked once, and guarded on whether the sheet is
  // already up. A click can land before hydration and change nothing; a blind
  // retry would then close a sheet that *had* opened, so this checks first.
  await expect(async () => {
    if (!(await sheet.isVisible())) {
      await trigger.click();
    }
    await expect(sheet).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
}

/**
 * Choose a category facet and wait for it to take effect.
 *
 * Guarded on the facet group's current value so a retry cannot toggle the
 * choice back off — every facet here is a toggle, not a set-to.
 */
async function chooseCategory(page: import("@playwright/test").Page, slug: string) {
  await openFacets(page);

  await expect(async () => {
    if ((await page.locator(`ul[data-facet-value="${slug}"]`).count()) === 0) {
      await facetChoice(page, slug).click();
    }
    await expect(page).toHaveURL(new RegExp(`[?&]category=${slug}`));
  }).toPass({ timeout: 15_000 });
}

/**
 * A facet choice, whichever copy of the panel is showing.
 *
 * Both copies exist in the DOM at every viewport — only one is visible — so
 * this selects by the button's `data-facet` value and `:visible` rather than by
 * role. Inside the mobile sheet the whole panel is portaled into a Radix modal,
 * and role-based lookup there resolved to nothing even though the button was
 * plainly on screen.
 */
function facetChoice(page: import("@playwright/test").Page, slug: string) {
  return page.locator(`button[data-facet="${slug}"]:visible`).first();
}

test.describe("search finds what the brief says it must", () => {
  test("'comcast' finds the internet bill playbook", async ({ page }) => {
    await search(page, "comcast");

    // No title or tag contains "comcast". This passes only via the synonym
    // group (comcast ↔ internet) — the category map alone would add finance
    // rows without proving the term reached the search.
    await expect(
      page.getByRole("heading", { name: TITLES.internet, exact: true }),
    ).toBeVisible();
  });

  test("'japan itinerary' finds the Japan itinerary playbook", async ({ page }) => {
    await search(page, "japan itinerary");

    await expect(page.getByRole("heading", { name: TITLES.japan, exact: true })).toBeVisible();
  });

  test("the typo 'insurence' finds cheaper car insurance", async ({ page }) => {
    await search(page, "insurence");

    // The trigram branch. Nothing in the catalogue spells it that way, so this
    // is the only mechanism that can satisfy it.
    await expect(
      page.getByRole("heading", { name: TITLES.insurance, exact: true }),
    ).toBeVisible();
  });

  test("'lower my bills' returns Personal finance and says why", async ({ page }) => {
    await search(page, "lower my bills");

    await expect(
      page.getByRole("heading", { name: TITLES.internet, exact: true }),
    ).toBeVisible();

    // The substitution notice is not decoration. Without it the reader cannot
    // tell that the category map, rather than their words, chose these rows.
    const notice = page.getByTestId("matched-category");
    await expect(notice).toBeVisible();
    await expect(notice).toContainText("Personal finance");
    // The reader's own word, not the keyword that happened to match.
    await expect(notice).toContainText("bills");
  });

  test("a nonsense query offers the request form instead of a blank page", async ({ page }) => {
    await search(page, "xyzzy plugh frobnicate");

    // By role, not by text: the count line and the empty-state heading both used to
    // say "No playbooks yet for …", which made a plain text locator ambiguous.
    await expect(
      page.getByRole("heading", { name: /No playbooks yet for/ }),
    ).toBeVisible();

    // The third never-dead-end layer. Without this the search is a dead end.
    await expect(page.getByRole("heading", { name: "Request this playbook" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Request this playbook" })).toBeVisible();

    // Popular playbooks, so the page still shows the catalogue exists.
    await expect(page.getByRole("heading", { name: "Popular playbooks" })).toBeVisible();
  });
});

test.describe("filters live in the URL", () => {
  test("choosing a category updates the URL and the results", async ({ page }) => {
    await gotoPage(page, "/playbooks");

    const before = await page.getByTestId("playbook-card").count();

    // Selected by slug, not by the button's text "💳 Personal finance".
    await chooseCategory(page, "personal-finance");

    // The URL is the state — not merely a mirror of it.
    await expect(page).toHaveURL(/category=personal-finance/);

    const after = await page.getByTestId("playbook-card").count();
    expect(after).toBeLessThan(before);
    await expect(
      page.getByRole("heading", { name: TITLES.japan, exact: true }),
    ).toHaveCount(0);
  });

  test("a filtered URL reproduces the same results when opened directly", async ({ page }) => {
    // The shareability requirement: a link must mean the same thing to someone
    // who was not in the room when it was built.
    await page.goto("/playbooks?category=personal-finance&view=list");

    await expect(
      page.getByRole("heading", { name: TITLES.internet, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: TITLES.japan, exact: true }),
    ).toHaveCount(0);
  });

  test("the outcome pill filters and appears in the URL", async ({ page }) => {
    await gotoPage(page, "/playbooks");

    await page.getByRole("button", { name: "Save money", exact: true }).click();

    await expect(page).toHaveURL(/outcome=save_money/);
  });

  test("switching to list view appears in the URL", async ({ page }) => {
    await gotoPage(page, "/playbooks");

    await page.getByRole("button", { name: "List view" }).click();

    await expect(page).toHaveURL(/view=list/);
  });

  test("changing a filter resets to page 1", async ({ page }) => {
    await gotoPage(page, "/playbooks?page=3");

    await page.getByRole("button", { name: "Save money", exact: true }).click();

    // Landing on page 7 of a shorter list would look like "the filter found
    // nothing" when it found plenty on page 1.
    await expect(page).not.toHaveURL(/page=/);
  });

  test("a category page keeps its own filters in the URL", async ({ page }) => {
    await gotoPage(page, "/c/travel-planning");

    await expect(page.getByRole("heading", { name: TITLES.japan, exact: true })).toBeVisible();

    // Sort is a native <select>, so its role is combobox and an option is
    // chosen with selectOption. Clicking it would open the picker, not the
    // option, and the URL assertion below would then pass for the wrong reason.
    await page.getByLabel("Sort").selectOption("recently_verified");

    // The href is built against /c/travel-planning, so the filter must not
    // escape back to /search and drop the category.
    await expect(page).toHaveURL(/\/c\/travel-planning\?/);
  });

  test("an unknown parameter is ignored rather than fatal", async ({ page }) => {
    await page.goto("/playbooks?sort=by_vibes&outcome=vibes&page=-2");

    // A stale or hand-edited link should show the unfiltered list, not a 500.
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(await page.getByTestId("playbook-card").count()).toBeGreaterThan(0);
  });
});

test.describe("navigation destinations render", () => {
  const routes = [
    { path: "/playbooks", heading: /^All playbooks$/ },
    { path: "/categories", heading: /^Categories$/ },
    { path: "/kits", heading: /^Starter kits$/ },
    { path: "/c/personal-finance", heading: /Personal finance/ },
    { path: "/k/cut-your-bills-kit", heading: /^Cut your bills kit$/ },
    { path: "/use-cases/cut-monthly-bills", heading: /^Cut monthly bills$/ },
  ];

  for (const route of routes) {
    test(`${route.path} renders`, async ({ page }) => {
      await page.goto(route.path);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(route.heading);
    });
  }

  test("a starter kit lists its playbooks in order", async ({ page }) => {
    await page.goto("/k/cut-your-bills-kit");

    // Row density, so the kit reads as an ordered list rather than a grid.
    await expect(page.locator('[data-density="row"]').first()).toBeVisible();
    await expect(page.getByTestId("playbook-card")).toHaveCount(2);
  });

  test("an unknown category is a 404, not an empty page", async ({ page }) => {
    const response = await page.goto("/c/not-a-category");

    expect(response?.status()).toBe(404);
  });
});