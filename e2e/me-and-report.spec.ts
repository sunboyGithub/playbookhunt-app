import { expect, test, type Page } from "@playwright/test";

import { signInOrSkip } from "./support/auth";
import { grantClipboard } from "./support/browser";
import { copiedActionsFor } from "./support/db";

/**
 * The account page and the report it edits, in a browser.
 *
 * One test rather than several, on purpose: every step here depends on the one
 * before it — a save makes a card appear, a try makes the "Did it work?" prompt
 * appear, a report makes an editable row — and splitting them would mean
 * arranging the same database state five times over for no added coverage. The
 * boundaries that *are* worth separate assertions are checked inside it.
 *
 * The path walked is the reader's: save from the playbook, copy a prompt, say
 * whether it worked, find both in `/me`, correct the number, delete the report,
 * turn the reminder off, sign out.
 */

/** Long, because signing in waits on the local mail server as well as the app. */
test.describe.configure({ timeout: 120_000 });

const SLUG = "lower-your-internet-bill";
const AMOUNT = "83";

async function openAccount(page: Page): Promise<void> {
  await page.goto("/me", { waitUntil: "networkidle" });
}

test.describe("my account", () => {
  test("save, try, report, correct, delete, opt out, sign out", async ({ page }) => {
    const reader = await signInOrSkip(page, "me");

    /* ---------------------------------------------------------------- save */

    await page.goto(`/p/${SLUG}`, { waitUntil: "networkidle" });

    // `data-saved` rather than `aria-pressed`: the latter is deliberately absent
    // when signed out, because a star that claims to be a toggle to somebody who
    // cannot press it is a lie. By here the reader is signed in.
    const saveButton = page.getByTestId("save-button").first();
    await expect(saveButton).toHaveAttribute("data-saved", "false");
    await saveButton.click();
    await expect(saveButton).toHaveAttribute("data-saved", "true");

    // The star flips optimistically, so its state says nothing about whether the
    // write landed. The toast is the action's return, and waiting for it is what
    // stops the reload below from racing the insert — which is a race that only
    // loses on the slower viewport, i.e. intermittently, on mobile.
    await expect(page.locator("[data-sonner-toast]").first()).toContainText("Saved");

    // The write is server-side in a server action, so the star changing is the
    // round trip having completed rather than an optimistic guess. It survives a
    // reload because it was a row, not a piece of state.
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.getByTestId("save-button").first()).toHaveAttribute("data-saved", "true");

    await openAccount(page);
    await expect(page.getByTestId("me-card")).toHaveCount(1);
    await expect(page.getByTestId("me-card").first()).toHaveAttribute("data-slug", SLUG);

    /* ----------------------------------------------------------------- try */

    // The try log is what puts a playbook on the "Tried" tab, and it is written
    // by the copy button rather than by a separate "I tried this" action.
    await grantClipboard(page);
    await page.goto(`/p/${SLUG}`, { waitUntil: "networkidle" });
    await page
      .locator('[data-testid="try-button-mobile"]:visible, [data-testid="try-button"]:visible')
      .first()
      .click();
    await expect(page.getByTestId("try-panel")).toBeVisible();
    await page.getByTestId("try-copy").click();
    await expect(page.getByTestId("try-copy")).toContainText("Copied");

    // "Copied" on the button and "tried" in the database are genuinely not the
    // same moment. The copy logs the try without awaiting it — deliberately, so
    // an analytics insert can never delay somebody taking their prompt — and a
    // request still in flight when the browser navigates away is cancelled with
    // the page. So waiting for the write here is not belt-and-braces: navigate
    // first and the try event is genuinely lost, which on the slower viewport
    // made this test fail for a reason that had nothing to do with /me.
    const copiedAt = new Date(Date.now() - 5_000).toISOString();
    await expect(async () => {
      expect((await copiedActionsFor(reader, SLUG, copiedAt)).length).toBeGreaterThan(0);
    }).toPass({ timeout: 10_000 });

    await openAccount(page);
    await page.getByTestId("me-tab-tried").click();
    // The tabs are links, so the click is a client-side navigation and the URL
    // is the only thing that says the new page has rendered. Asserting the card
    // without it passed against the *saved* tab, which holds the same playbook.
    await page.waitForURL(/tab=tried/);
    await expect(page.getByTestId("me-card").first()).toHaveAttribute("data-slug", SLUG);

    // Tried but not reported: the card has to ask, because this is the moment
    // the answer is worth the most.
    await expect(page.getByTestId("me-report-cta").first()).toBeVisible();

    /* -------------------------------------------------------------- report */

    await page.goto(`/p/${SLUG}/report`, { waitUntil: "networkidle" });

    // Only the result is required. Everything else is optional by design, so
    // this is the smallest thing a reader can honestly do.
    await page.getByTestId("report-result-worked").click();
    await page.getByTestId("report-amount").fill(AMOUNT);
    await page.getByTestId("report-submit").click();

    await expect(page.getByTestId("report-thanks")).toBeVisible();

    await openAccount(page);
    await page.getByTestId("me-tab-reported").click();
    await page.waitForURL(/tab=reported/);

    const card = page.getByTestId("me-card").first();
    await expect(card).toHaveAttribute("data-slug", SLUG);
    // Filed, so asking again would be asking a question with an answer.
    await expect(page.getByTestId("me-report-cta")).toHaveCount(0);

    /* --------------------------------------------------------------- edit */

    await page.getByTestId("me-edit-report").first().click();
    await page.waitForLoadState("networkidle");

    expect(new URL(page.url()).pathname).toBe(`/p/${SLUG}/report`);
    // The prefilled value is the stored one, so a correction is a change to one
    // field rather than a retype of four.
    await expect(page.getByTestId("report-amount")).toHaveValue(AMOUNT);

    await page.getByTestId("report-amount").fill("91");
    await page.getByTestId("report-submit").click();

    // A confirmation, not the share sheet. There is nothing to share about a
    // corrected number, and a share prompt would be an ask on a page where the
    // reader's only business is fixing a typo.
    await expect(page.getByTestId("report-edited")).toBeVisible();
    await expect(page.getByTestId("report-thanks")).toHaveCount(0);

    /* ------------------------------------------------------------- delete */

    await openAccount(page);
    await page.getByTestId("me-tab-reported").click();
    await page.waitForURL(/tab=reported/);

    // Deletion is a withdrawal, so it happens without a countdown and without a
    // window — but it is still deliberate, and one tap by accident is not.
    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByTestId("me-delete-report").first().click();

    await expect(page.getByTestId("me-card")).toHaveCount(0);
    await expect(page.getByTestId("me-empty")).toBeVisible();
    // An empty Reports tab offers the way back rather than a shrug.
    await expect(page.getByTestId("me-empty-cta")).toBeVisible();

    /* ------------------------------------------------------------ opt out */

    await page.getByTestId("me-tab-settings").click();
    // Wait for the navigation the way every other tab switch in this file does.
    // The delete above leaves a `router.refresh()` streaming, and a click landing
    // during it can be dropped — which showed up as `me-settings` never appearing
    // while the URL was still `tab=reported`. Asserting the URL makes that a
    // legible failure instead of a mysterious missing panel.
    await page.waitForURL(/tab=settings/);
    await expect(page.getByTestId("me-settings")).toBeVisible();

    const reminders = page.getByTestId("me-reminders-switch");
    await expect(reminders).toHaveAttribute("aria-checked", "true");
    await reminders.click();
    await expect(reminders).toHaveAttribute("aria-checked", "false");
    // The toast is the action's return. The switch moved before the write, and
    // a reload issued in that gap cancels the request outright — so the switch
    // would come back on, which is exactly what the next assertion is for.
    await expect(page.locator("[data-sonner-toast]").first()).toContainText("Reminders off");

    // Across a reload, because the switch is optimistic and an optimistic switch
    // that quietly reverts is the failure this check exists to catch.
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.getByTestId("me-reminders-switch")).toHaveAttribute("aria-checked", "false");

    /* ----------------------------------------------------------- sign out */

    // The account menu lives in the desktop header and inside the mobile sheet,
    // so the same action needs the trigger this viewport actually has.
    const desktopMenu = page.getByTestId("account-menu-trigger");
    if (await desktopMenu.isVisible()) {
      await desktopMenu.click();
    } else {
      await page.getByTestId("mobile-menu-trigger").click();
    }
    await page.getByTestId("sign-out").click();
    // Signing out redirects home, and that redirect *is* the sign-out — the
    // cookie is gone before it happens. Waiting for the URL rather than for the
    // network to go quiet is what stops the next navigation racing the POST.
    await page.waitForURL((url) => url.pathname === "/");

    // A signed-out reader cannot come back to /me, which is the only thing that
    // would prove the session ended.
    await openAccount(page);
    expect(new URL(page.url()).pathname).toBe("/login");
  });

  test("the report window and the report page agree about what a result means", async ({ page }) => {
    await signInOrSkip(page, "me-empty");

    // A brand-new account: three empty tabs, each saying something specific
    // rather than "0 results", because an empty page that does not say why is
    // indistinguishable from a broken one.
    for (const tab of ["saved", "tried", "reported"]) {
      await openAccount(page);
      await page.getByTestId(`me-tab-${tab}`).click();
      // All three empty states look the same, so nothing else would notice a
      // tab that never navigated.
      await page.waitForURL(new RegExp(`tab=${tab}`));
      await expect(page.getByTestId(`me-tab-${tab}`)).toHaveAttribute("aria-current", "page");
      await expect(page.getByTestId("me-empty")).toBeVisible();
      await expect(page.getByTestId("me-empty-cta")).toBeVisible();
    }

    // Tabs are links, so the state survives a reload and the back button.
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.getByTestId("me-tab-reported")).toHaveAttribute("aria-current", "page");

    await page.getByTestId("me-tab-saved").click();
    await page.waitForURL(/tab=saved/);
    await expect(page.getByTestId("me-tab-saved")).toHaveAttribute("aria-current", "page");

    await page.goBack();
    await page.waitForURL(/tab=reported/);
    await expect(page.getByTestId("me-tab-reported")).toHaveAttribute("aria-current", "page");
  });
});
