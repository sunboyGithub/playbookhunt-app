import { expect, test } from "@playwright/test";

import { freshEmail } from "./support/auth";
import { adminClient } from "./support/db";
import { latestMessageTo, mailpitReachable, waitForSignInLink } from "./support/mailpit";

/**
 * Signing in with the email link, all the way through.
 *
 * The brief for P8 says account pages require authentication and that a
 * password-only session does not satisfy the criteria. There is no password in
 * this product: one step, a link in an inbox, and a code exchanged on the
 * server at `/auth/callback`. So this spec follows the link the way a reader
 * would — reads it out of the local Mailpit inbox, navigates it, and checks the
 * session that comes back — because every step after "we sent you a link" is
 * code this repo owns and every one of them can be wrong independently.
 *
 * Skipped when Mailpit is not running rather than failed: an absent SMTP sink is
 * a missing dependency, not a broken sign-in.
 */

const noMail = "needs the local Mailpit inbox (supabase start) to read the sign-in link";
const noKeys = "needs SUPABASE_SERVICE_ROLE_KEY in .env.local";

/**
 * Generous, because these tests cross three processes the app does not control:
 * the browser, GoTrue's SMTP send, and Mailpit. The default 30s is not enough on
 * a cold dev server, and a timeout here would say nothing about which of the
 * three was slow.
 */
test.describe.configure({ timeout: 90_000 });

test("a sign-in link creates the account, signs in, and survives a reload", async ({ page }) => {
  if (!(await mailpitReachable())) test.skip(true, noMail);

  const address = freshEmail("magic");
  const clickedAt = new Date();

  await page.goto("/login", { waitUntil: "networkidle" });

  await page.getByTestId("signin-email").fill(address);
  await page.getByTestId("signin-submit").click();

  // The screen says it sent something before it is known that it did. The mail
  // arriving is the other half of that claim, which is what the next line is.
  await expect(page.getByTestId("check-email")).toBeVisible();

  const link = await waitForSignInLink(address, clickedAt);
  expect(link).toContain("/auth/v1/verify");

  // Navigated as a click, not fetched: GoTrue redirects to the callback with a
  // code, and only a real navigation carries those redirects.
  await page.goto(link, { waitUntil: "networkidle" });

  // The callback exchanged the code and redirected home, so nothing about the
  // address bar should still carry the exchange.
  expect(page.url()).not.toContain("/auth/callback");
  expect(page.url()).not.toContain("code=");

  // The proof of a session is a page that needs one. `/me` is that page, and it
  // is the same assertion in both viewports — the header's account affordance is
  // deliberately not used here, because the avatar lives in the desktop header
  // and the mobile menu has no avatar at all, so a header assertion would only
  // be testable on one of the two projects.
  await page.goto("/me", { waitUntil: "networkidle" });
  expect(new URL(page.url()).pathname).toBe("/me");
  await expect(page.getByTestId("me-tab-settings")).toBeVisible();

  // Across a reload, so it is a cookie and not something React held.
  await page.reload({ waitUntil: "networkidle" });
  expect(new URL(page.url()).pathname).toBe("/me");
  await expect(page.getByTestId("me-tab-settings")).toBeVisible();

  // The address is now an account, and the message that created it is still the
  // one that was sent to it.
  expect((await latestMessageTo(address))?.To[0]?.Address.toLowerCase()).toBe(address.toLowerCase());
});

test("/me is not readable without a session, and says where to go", async ({ page }) => {
  await page.goto("/me", { waitUntil: "networkidle" });

  // Saved playbooks and reports are the reader's own, so an anonymous visitor is
  // sent to sign in with the page they wanted kept — not to the homepage, which
  // would lose the /me they asked for.
  expect(new URL(page.url()).pathname).toBe("/login");
  expect(new URL(page.url()).searchParams.get("next")).toBe("/me");

  // And the private surfaces are not in the HTML that was served on the way.
  await expect(page.getByTestId("me-list")).toHaveCount(0);
  await expect(page.getByTestId("me-settings")).toHaveCount(0);
});

test("a magic link for an address that already has an account signs the same person in", async ({
  page,
}) => {
  if (!(await mailpitReachable())) test.skip(true, noMail);
  if (!adminClient()) test.skip(true, noKeys);

  const address = freshEmail("returning");
  // The account exists before the link is sent — which is what "sign in" means,
  // as distinct from "sign up". Supabase decides which it was; the reader does
  // not get two different steps.
  await adminClient()!
    .auth.admin.createUser({ email: address, email_confirm: true })
    .catch(() => undefined);

  await page.goto("/login", { waitUntil: "networkidle" });
  await page.getByTestId("signin-email").fill(address);

  const clickedAt = new Date();
  await page.getByTestId("signin-submit").click();
  await expect(page.getByTestId("check-email")).toBeVisible();

  await page.goto(await waitForSignInLink(address, clickedAt), { waitUntil: "networkidle" });

  await page.goto("/me", { waitUntil: "networkidle" });
  expect(new URL(page.url()).pathname).toBe("/me");
  await expect(page.getByTestId("me-tab-settings")).toBeVisible();
});

test("a sign-in that the provider refused returns a sentence, not a homepage", async ({ page }) => {
  // The other end of the same exchange: a link the provider will not honour, or
  // a tab closed before the callback. Landing on a homepage with no explanation
  // is the failure — the reader has no idea whether they are signed in.
  await page.goto("/auth/callback?error=access_denied&error_description=Email+link+is+invalid", {
    waitUntil: "networkidle",
  });

  expect(new URL(page.url()).pathname).toBe("/");

  // The provider's own words, passed through rather than replaced: "something
  // went wrong" tells a reader nothing they can act on.
  await expect(page.getByText(/email link is invalid/i).first()).toBeVisible();

  // And no session was created on the way past. `/me` is the page that needs
  // one, so it is the assertion that holds in both viewports — the header shows
  // its account affordances in the desktop bar or the mobile sheet, never both.
  await page.goto("/me", { waitUntil: "networkidle" });
  expect(new URL(page.url()).pathname).toBe("/login");
  expect(new URL(page.url()).searchParams.get("next")).toBe("/me");
});

test("an anonymous caller cannot trigger the follow-up job", async ({ request }) => {
  // The cron route is the one endpoint on this site that emails people on
  // command, and nothing in the browser ever calls it — which is exactly why it
  // is the one most likely to ship unprotected.
  const response = await request.get("/api/cron/followups");

  // 503 when no CRON_SECRET is configured locally, 401 when one is. Both refuse;
  // 200 is the only failure that matters.
  expect([401, 503]).toContain(response.status());
});
