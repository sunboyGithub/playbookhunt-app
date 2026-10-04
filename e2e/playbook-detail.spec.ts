import { expect, test, type Page } from "@playwright/test";

import { adminClient, copiedActionsSince, reportCountsBySlug } from "./support/db";
import { REPORT_THRESHOLD } from "../src/server/queries/types";

/**
 * The three playbooks in the catalogue.
 *
 * Read from the seed rather than guessed, for the same reason P5's search spec
 * reads titles from the YAML: a wrong constant here fails as a product bug and
 * sends the next person looking through the ranking code for a defect that was
 * in the test.
 */
const SLUGS = ["cheaper-car-insurance", "lower-your-internet-bill", "plan-7-days-in-japan"] as const;

/**
 * Agents that must appear as greyed chips, and one that must not appear at all.
 *
 * `instinct` is `status = hidden`, which means it is not listed anywhere. A test
 * that only checked the three expected chips would pass with Instinct rendered
 * alongside them, so the absence is asserted directly.
 */
const COMING_SOON = [
  { slug: "chatgpt-dots", name: "ChatGPT" },
  { slug: "grok-bot", name: "Grok" },
  { slug: "manus", name: "Manus" },
];

const ABSENT_AGENT = "Instinct";

async function gotoDetail(page: Page, slug: string) {
  await page.goto(`/p/${slug}`, { waitUntil: "networkidle" });
}

/**
 * Grant the clipboard permissions the copy assertion needs.
 *
 * `clipboard-write` is Chromium-only in Playwright's permission list — WebKit
 * rejects the whole call with "Unknown permission" rather than ignoring the one
 * it does not know — so the mobile project gets read only. Writing still works
 * there because WebKit does not gate clipboard writes on an explicit grant.
 */
async function grantClipboard(page: Page) {
  const isWebKit = page.context().browser()?.browserType().name() === "webkit";

  await page.context().grantPermissions(
    isWebKit ? ["clipboard-read"] : ["clipboard-read", "clipboard-write"],
  );
}

test.describe("playbook detail", () => {
  for (const slug of SLUGS) {
    test(`${slug} has one heading and its evidence is threshold-gated`, async ({ page }) => {
      await gotoDetail(page, slug);

      // One H1, and the title in it. A second H1 would break the heading order
      // the acceptance criteria call for.
      const heading = page.getByRole("heading", { level: 1 });
      await expect(heading).toHaveCount(1);

      // The threshold, read from the database rather than assumed. Which side of
      // it this playbook falls on depends on whether fixtures have been seeded,
      // and a test that hard-codes "no reports" quietly stops describing the
      // product the moment somebody runs `pnpm db:seed-stats` — which is exactly
      // what happened to the first version of this test.
      const counts = await reportCountsBySlug(SLUGS);
      const reports = counts.get(slug) ?? 0;

      if (reports >= REPORT_THRESHOLD) {
        // Enough reports: the rate is published, with its denominator attached.
        await expect(page.getByText(/^\d+% worked$/).first()).toBeVisible();
        await expect(page.getByTestId("worked-bar")).toBeVisible();
        await expect(page.getByText(new RegExp(`n = ${reports} reports`)).first()).toBeVisible();
        return;
      }

      // Below the threshold: no rate, no bar, and an explanation rather than an
      // empty track that would read as "nobody has tried".
      await expect(page.getByTestId("worked-bar")).toHaveCount(0);
      await expect(page.getByText(/^\d+% worked$/)).toHaveCount(0);

      // The bar's empty state distinguishes "nobody has reported" from "not
      // enough reports yet", because those are different facts.
      const emptyState =
        reports === 0 ? "No reports yet — be the first" : `Not enough reports yet — ${reports} so far`;
      await expect(page.getByText(emptyState).first()).toBeVisible();

      // Asserted by the absence of the two things that would mean a number was
      // published without a basis.
      await expect(page.getByText(/Early · \d+ reports?/).first()).toBeVisible();
      await expect(page.getByText("Not enough data")).toHaveCount(0);
      await expect(page.getByText(/n = \d+ reports/)).toHaveCount(0);
    });

    test(`${slug} shows the prompt and the steps`, async ({ page }) => {
      await gotoDetail(page, slug);

      await expect(page.getByTestId("prompt-text")).toBeVisible();
      // The prompt is the point of the page; a collapsed-to-nothing block hides
      // the thing the reader came for.
      await expect(page.getByTestId("prompt-text")).not.toBeEmpty();

      await expect(page.getByTestId("toggle-prompt")).toBeVisible();
    });

    test(`${slug} lists the coming-soon agents as disabled chips`, async ({ page }) => {
      await gotoDetail(page, slug);

      for (const agent of COMING_SOON) {
        const chip = page.getByTestId(`agent-chip-${agent.slug}`);
        await expect(chip).toBeVisible();
        await expect(chip).toBeDisabled();
        await expect(chip).toContainText(agent.name);
        // A mark, not a letter. Asserted via the svg rather than a screenshot so
        // a regression here fails rather than being something to notice.
        await expect(chip.locator("svg")).toHaveCount(1);
      }

      // No "Coming soon" wording anywhere on the page.
      await expect(page.getByText(/Coming soon/i)).toHaveCount(0);
      await expect(page.getByText(/Script only/i)).toHaveCount(0);

      // The absence assertion. Checking only that the three expected chips
      // appear would pass with a hidden agent rendered alongside them.
      await expect(page.getByText(ABSENT_AGENT, { exact: false })).toHaveCount(0);
    });

    test(`${slug} links to its category and shows related playbooks`, async ({ page }) => {
      await gotoDetail(page, slug);

      // Two try buttons are in the DOM at every viewport, and how many are
      // *visible* differs by design: one on desktop, two on a phone.
      //
      // The mobile bar surfaces the CTA under the header because on a phone the
      // sidebar — which holds the other one — sits below the entire main column,
      // a long way from the title. So on a phone the duplicate is deliberate
      // rather than a leak, and the assertion is about what they do rather than
      // about how many there are.
      //
      // An earlier version used `.or()`, which unions two elements and then
      // fails a strict-mode check that both exist; a later one asserted exactly
      // one visible button, which is true on desktop and false on mobile. The
      // page was right both times.
      //
      // And a third asserted every button's `href` was `/p/[slug]/try`. P7 made
      // these `<TryDialog>` triggers — a `<span>` inside a `<button>`, not an
      // anchor — so there is no href to read and the try flow opens in place.
      // What replaced it is stronger: the sheet really opens, for this
      // playbook.
      const tryButtons = page.locator(
        '[data-testid="try-button-mobile"]:visible, [data-testid="try-button"]:visible',
      );
      await expect(tryButtons.first()).toBeVisible();

      await tryButtons.first().click();
      await expect(page.getByTestId("try-panel")).toBeVisible();

      // It is this playbook's flow, not another's — the sheet carries the title
      // through to the report link, which is the cheapest unambiguous witness.
      await expect(page.getByTestId("try-report-link")).toHaveAttribute(
        "href",
        `/p/${slug}/report`,
      );
    });
  }

  test("copying the prompt writes to the clipboard and logs a try event", async ({ page }) => {
    if (!adminClient()) {
      test.skip(true, "needs SUPABASE_SERVICE_ROLE_KEY in .env.local to read try_events back");
    }

    await grantClipboard(page);
    await gotoDetail(page, SLUGS[0]);

    // The try event is logged, read back out of the table rather than
    // intercepted on the wire.
    //
    // Intercepting is what an earlier version of this test did, against
    // `**/rest/v1/try_events**` — and it could never have passed. `logTryEvent`
    // is a server action: the browser POSTs to the Next route with a
    // `Next-Action` header, and the Supabase insert happens *server-side*.
    // `page.route` only sees requests the browser makes, so the PostgREST call
    // it was watching for is made by the Node process, not by the page. Reading
    // the row is the stronger assertion anyway — it proves the action ran, wrote
    // the right value, and attached it to the right playbook, which a request
    // assertion could not.
    const since = new Date(Date.now() - 5_000).toISOString();

    const prompt = (await page.getByTestId("prompt-text").textContent()) ?? "";

    await page.getByTestId("copy-prompt").click();

    // The label changes, and it is the confirmation the reader gets.
    await expect(page.getByTestId("copy-prompt")).toContainText("Copied");
    await expect(page.getByText("Copied! Paste it into Muse.")).toBeVisible();

    // What actually landed on the clipboard is the whole prompt, whitespace
    // included — a trimmed copy would silently break a reader's paste.
    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboard.trim()).toBe(prompt.trim());

    // The action is fired without being awaited, so the row can land a tick
    // after the label change. `since` is backdated by a few seconds to absorb
    // clock skew between this machine and the Postgres container.
    await expect(async () => {
      const actions = await copiedActionsSince(SLUGS[0], since);
      expect(actions.length).toBeGreaterThan(0);
    }).toPass({ timeout: 5_000 });
  });

  test("the bar and its percentages appear once the threshold is met", async ({ page }) => {
    // Requires `pnpm db:seed-stats`. Skipped rather than failed when the
    // fixtures are absent: the default database legitimately has no reports,
    // and asserting a bar exists against it would be asserting the fixtures
    // exist, which is not what this test is about.
    await gotoDetail(page, "cheaper-car-insurance");

    const bar = page.getByTestId("worked-bar");
    if ((await bar.count()) === 0) {
      test.skip(true, "needs pnpm db:seed-stats");
      return;
    }

    await expect(bar).toBeVisible();
    await expect(bar.locator("span")).toHaveCount(3);

    // The bar conveys its information through width and colour alone, so the
    // text alternative is the only version a screen reader gets.
    await expect(page.locator(".sr-only", { hasText: "Worked" }).first()).toBeAttached();

    // 40 reports with 27 worked → 68%, and the denominator beside it.
    await expect(page.getByText("n = 40 reports").first()).toBeVisible();
  });
});

test.describe("playbook detail without the try flow", () => {
  // The acceptance criteria call for the detail page to be tested
  // independently of the try sheet, so that a change to the agent list — which
  // is what the try picker reads — cannot make the detail page's own tests
  // fail. That is asserted by the suite's structure rather than by a flag: no
  // test here opens the try sheet, and these three still pass with every agent
  // except Muse disabled.
  for (const slug of SLUGS) {
    test(`${slug} renders its evidence sections with no try flow open`, async ({ page }) => {
      await gotoDetail(page, slug);

      await expect(page.getByRole("heading", { name: "The playbook" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "What you'll need" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "What happened for others" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Did it work for you?" })).toBeVisible();

      // No try sheet anywhere on the page.
      await expect(page.locator('[role="dialog"]')).toHaveCount(0);
    });
  }
});