import { expect, test, type Page } from "@playwright/test";

import { adminClient, copiedActionsSince } from "./support/db";

/**
 * The try flow, end to end in a browser.
 *
 * Separate from `playbook-detail.spec.ts` because this is the flow P7 added, and
 * it is the first place a reader types something. Everything asserted here is
 * about what happens to those typed values.
 *
 * The suite runs under both Playwright projects, so every test in this file also
 * runs at the iPhone 13 viewport — which is the point: the brief asks for a
 * mobile fill → copy check, and rather than hand-rolling a device in one test
 * the whole file gets the 390x844 treatment for free.
 */

const SLUG = "lower-your-internet-bill";

/**
 * Values chosen to be findable in a clipboard read and impossible to confuse with
 * a placeholder. If one of these turns up in a server-side payload, that is the
 * privacy requirement failing, not a flaky assertion.
 */
const TYPED = {
  price: "83",
  zip: "94110",
  bill: "Balance 214.55 since March",
  plan: "Gigabit",
  tenure: "4 years",
} as const;

async function grantClipboard(page: Page) {
  const isWebKit = page.context().browser()?.browserType().name() === "webkit";

  await page.context().grantPermissions(
    isWebKit ? ["clipboard-read"] : ["clipboard-read", "clipboard-write"],
  );
}

/** Open the try flow, from whichever trigger this viewport actually shows. */
async function openTryFlow(page: Page) {
  await page.goto(`/p/${SLUG}`, { waitUntil: "networkidle" });

  const triggers = page.locator(
    '[data-testid="try-button-mobile"]:visible, [data-testid="try-button"]:visible',
  );

  await triggers.first().click();
  await expect(page.getByTestId("try-panel")).toBeVisible();
}

test.describe("try flow", () => {
  test("fills the form and copies a prompt with the values in it", async ({ page }) => {
    await grantClipboard(page);
    await openTryFlow(page);

    // Provider is a picker, so it is a chip rather than a text field.
    await page.getByTestId("try-option-provider-Xfinity").click();
    await page.getByLabel(/monthly price/i).fill(TYPED.price);
    await page.getByLabel(/zip code/i).fill(TYPED.zip);
    await page.getByLabel(/latest bill/i).fill(TYPED.bill);
    await page.getByLabel(/plan name/i).fill(TYPED.plan);
    await page.getByLabel(/customer tenure/i).fill(TYPED.tenure);

    // Every placeholder resolved. The playbook has six inputs, so this asserts
    // all six were filled — a template key with no matching field would also
    // leave a `[label]` behind, and would fail here.
    const prompt = (await page.getByTestId("try-prompt").textContent()) ?? "";
    expect(prompt).toContain("Xfinity");
    expect(prompt).toContain(TYPED.price);
    expect(prompt).toContain(TYPED.zip);
    expect(prompt).toContain(TYPED.bill);
    expect(prompt).toContain(TYPED.plan);
    expect(prompt).toContain(TYPED.tenure);
    expect(prompt).not.toContain("[");
    expect(prompt).not.toContain("{{");

    await page.getByTestId("try-copy").click();
    await expect(page.getByTestId("try-copy")).toContainText("Copied");

    // The clipboard is the deliverable. It has to be the filled prompt, not the
    // raw template — this is the assertion that would catch templating having
    // been done server-side, which AGENTS.md forbids.
    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboard.trim()).toBe(prompt.trim());
    expect(clipboard).toContain(TYPED.bill);
  });

  test("an unfilled optional field is marked rather than left blank", async ({ page }) => {
    await openTryFlow(page);

    // Only the required provider is filled. Every optional slot has no value,
    // and each must appear as a labelled placeholder so the reader can see what
    // the prompt is missing rather than wondering why it is vague.
    await page.getByTestId("try-option-provider-Xfinity").click();

    const prompt = (await page.getByTestId("try-prompt").textContent()) ?? "";
    expect(prompt).toContain("[Monthly price]");
    expect(prompt).toContain("[ZIP code]");
    expect(prompt).not.toContain("{{");
  });

  test("copying still works before the required field is filled", async ({ page }) => {
    await grantClipboard(page);
    await openTryFlow(page);

    // AGENTS.md: never require anything to copy a prompt. So the button works
    // with nothing filled, and says what is missing rather than refusing.
    await page.getByTestId("try-copy").click();

    await expect(page.getByTestId("try-missing-fields")).toBeVisible();
    await expect(page.getByTestId("try-missing-fields")).toContainText("Provider");
    await expect(page.getByTestId("try-copy")).toContainText("Copied");

    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboard).toContain("[Provider]");
  });

  test("the try flow is reachable directly at its own URL", async ({ page }) => {
    await page.goto(`/p/${SLUG}/try`, { waitUntil: "networkidle" });

    // The standalone page is not a dialog, so it must not claim to be one.
    await expect(page.getByTestId("try-panel")).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // And it says the privacy thing the sheet omits, because here the page is
    // the whole page rather than an overlay on someone else's content.
    await expect(page.getByText(/nothing you type here is sent to us/i)).toBeVisible();
  });

  test("copied prompts are logged against the right playbook", async ({ page }) => {
    if (!adminClient()) {
      test.skip(true, "needs SUPABASE_SERVICE_ROLE_KEY in .env.local to read try_events back");
    }

    await grantClipboard(page);
    await openTryFlow(page);
    await page.getByTestId("try-copy").click();

    // Read back out of the table rather than intercepted on the wire: the
    // insert happens server-side inside the server action, so the browser never
    // makes the request that `page.route` would be watching for.
    const since = new Date(Date.now() - 5_000).toISOString();

    await expect(async () => {
      const actions = await copiedActionsSince(SLUG, since);
      expect(actions.length).toBeGreaterThan(0);
    }).toPass({ timeout: 5_000 });
  });

  test("a signed-out reader is offered a reminder, never blocked", async ({ page }) => {
    await grantClipboard(page);
    await openTryFlow(page);

    // Nothing before the copy — asking someone to sign in before they have got
    // anything from the page is the behaviour AGENTS.md rules out.
    await expect(page.getByTestId("try-reminder-card")).toHaveCount(0);

    await page.getByTestId("try-copy").click();
    await expect(page.getByTestId("try-reminder-card")).toBeVisible();

    // "Not now" is remembered, so the offer does not follow the reader around.
    await page.getByTestId("try-reminder-dismiss").click();
    await expect(page.getByTestId("try-reminder-card")).toHaveCount(0);

    // Across a reload, so the dismissal is read from storage rather than from
    // React state that a reload would have cleared anyway.
    await page.reload({ waitUntil: "networkidle" });
    await openTryFlow(page);

    await page.getByTestId("try-copy").click();
    await expect(page.getByTestId("try-copy")).toContainText("Copied");
    await expect(page.getByTestId("try-reminder-card")).toHaveCount(0);
  });

  test("the report link after copy does not 404", async ({ page }) => {
    await openTryFlow(page);

    // The try flow ends by asking whether it worked, so the destination has to
    // exist. P8 fills in the real form; until then this asserts the route.
    const href = await page.getByTestId("try-report-link").getAttribute("href");
    expect(href).toBe(`/p/${SLUG}/report`);

    const response = await page.goto(href as string);
    expect(response?.status()).toBeLessThan(400);
  });
});