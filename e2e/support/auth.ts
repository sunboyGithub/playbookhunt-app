/**
 * Getting a real signed-in reader into a Playwright page.
 *
 * ## Why the link is followed rather than the cookie injected
 *
 * The session this site uses is a PKCE one: Google, Facebook and the email link
 * all land on `/auth/callback`, which exchanges a code for a session *on the
 * server* and sets the cookies there. A test that wrote those cookies directly
 * would be testing a session the app can never actually create, and would keep
 * passing if `/auth/callback` were deleted.
 *
 * So a signed-in test navigates a real sign-in link and lands wherever the app
 * sends it. That costs one extra navigation and buys the thing worth testing.
 *
 * ## Why it goes through Mailpit
 *
 * There is a shorter route — `auth.admin.generateLink` hands out a link without
 * sending any mail — and it was tried first. It does not work: GoTrue redirects
 * to `redirect_to` with no `code` on it, `/auth/callback` finds nothing to
 * exchange, and the browser lands on the homepage signed out with no error
 * anywhere. The app's own path is the only one that produces the session it is
 * designed to produce, so this is that path.
 *
 * Every address is unique per call, so two specs — or the desktop and mobile
 * projects — can never be signed in by each other's mail.
 */

import { test, type Page } from "@playwright/test";

import { adminClient } from "./db";
import { mailpitReachable, waitForSignInLink } from "./mailpit";

let counter = 0;

/**
 * Sign in, or skip the test — and hand back the address either way.
 *
 * The awkward one is the return type. `test.skip()` throws at runtime but is
 * typed `void`, so a caller cannot use it to narrow a `string | false`; the
 * `throw` below is unreachable and exists only for the compiler, which is why it
 * says so. The alternative — a bare `as string` at each call site — is the same
 * assertion with nothing explaining it.
 */
export async function signInOrSkip(page: Page, prefix = "reader"): Promise<string> {
  const address = await signInWithEmailLink(page, prefix);

  if (!address) {
    test.skip(true, "needs the local Supabase stack, Mailpit and SUPABASE_SERVICE_ROLE_KEY");
    throw new Error("skipped — unreachable");
  }

  return address;
}

/** A per-run address, so no test can be signed in by another's mail. */
export function freshEmail(prefix = "reader"): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter}@example.test`;
}

/**
 * Sign in through the email link, in the browser, as a new reader.
 *
 * Returns the address it signed in with, so a caller that later needs to look up
 * this reader's rows in the database can — the two projects run in parallel and
 * "somebody did this" is not "this reader did this".
 *
 * Returns false when the local stack cannot deliver the message, so callers can
 * skip rather than report a failure that is really an absent dependency.
 */
export async function signInWithEmailLink(page: Page, prefix = "reader"): Promise<string | false> {
  if (!(await mailpitReachable())) return false;
  if (!adminClient()) return false;

  const address = freshEmail(prefix);
  const clickedAt = new Date();

  await page.goto("/login", { waitUntil: "networkidle" });
  await page.getByTestId("signin-email").fill(address);
  await page.getByTestId("signin-submit").click();

  // The screen says it sent something before it is known that it did.
  await page.getByTestId("check-email").waitFor({ state: "visible", timeout: 15_000 });

  await page.goto(await waitForSignInLink(address, clickedAt), { waitUntil: "networkidle" });

  // The proof of a session, checked where it counts. `/me` is the page that needs
  // one, and it is the same check in both viewports — the header's account
  // affordances live in the desktop bar or the mobile sheet, never both.
  await page.goto("/me", { waitUntil: "networkidle" });
  if (new URL(page.url()).pathname !== "/me") {
    throw new Error(`Signed in at ${address} but /me is still unreachable.`);
  }

  return address;
}
