import { expect, test } from "@playwright/test";

import { signInOrSkip, signInWithEmailLink } from "./support/auth";
import { adminClient } from "./support/db";
import { deleteReport, demote, promoteToAdmin, queuePendingReport } from "./support/admin";

/**
 * P10's acceptance criteria, end to end.
 *
 * Three claims, in the order the brief states them:
 *
 * 1. A non-administrator gets a **404** from `/admin` — not a redirect, not a
 *    "you are not allowed" page. Both of those confirm the area exists; a 404 is
 *    the same answer as a page that was never built.
 * 2. The complete flow works: sign in with a magic link, get promoted, open
 *    `/admin`.
 * 3. **Approving or rejecting a report moves the public page.** This is the one
 *    the unit tests cannot reach — that the click reaches the database, that the
 *    statistics are recomputed, and that `/p/<slug>` renders differently
 *    afterwards is a seam, and seams are exactly what a unit test with no
 *    database in the way cannot see.
 *
 * ## Why the promotion is a direct write
 *
 * `support/admin.ts` runs the same single UPDATE `scripts/promote-admin.ts` runs.
 * Shelling out to the script from here would put a subprocess and an env-file
 * dependency in the path of every run of this suite to execute one line of SQL;
 * the script itself is exercised by the documented flow in `build_history.md`.
 *
 * ## Where the database lock is taken
 *
 * Inside `support/admin.ts`, not here. `desktop` and `mobile` run concurrently in
 * separate processes against one database, so queueing a report and moderating it
 * from both would race — and `withDbLock` is what stops them. But a spec that
 * wraps every call site has to remember to, and one that forgets fails in a way
 * that looks like a product bug rather than like a missing lock. Each mutating
 * helper now takes the lock itself, around its write and not around its reads,
 * so a test cannot get it wrong and the lock is not held across a slow
 * `listUsers`.
 *
 * Every test still cleans up in a `finally`. That is best-effort, not a
 * guarantee — Playwright abandons a test body the moment it exceeds its timeout
 * — so `e2e/support/global-setup.ts` also demotes anything an earlier run left
 * behind, once, before the first worker starts.
 */

const SLUG = "lower-your-internet-bill";

test.describe("the admin gate", () => {
  test("a signed-in reader gets a 404, not a refusal", async ({ page }) => {
    await signInOrSkip(page);

    const response = await page.goto("/admin", { waitUntil: "networkidle" });

    expect(response?.status()).toBe(404);
  });

  test("a signed-in reader gets a 404 from the queues too", async ({ page }) => {
    await signInOrSkip(page);

    // The layout gates the area, so one nested route is enough to show the gate
    // is at the layout rather than on each page.
    const response = await page.goto("/admin/reports", { waitUntil: "networkidle" });

    expect(response?.status()).toBe(404);
  });

  test("a signed-out visitor gets the same 404", async ({ page }) => {
    const response = await page.goto("/admin", { waitUntil: "networkidle" });

    // Identical to the signed-in case on purpose: the answer must not reveal
    // whether the visitor is signed in either.
    expect(response?.status()).toBe(404);
  });

  test("the refusal does not name administrators", async ({ page }) => {
    await signInOrSkip(page);
    await page.goto("/admin", { waitUntil: "networkidle" });

    const body = (await page.locator("body").innerText()).toLowerCase();

    expect(body).not.toContain("administrator");
    expect(body).not.toContain("moderation");
  });
});

test.describe("the promoted account", () => {
  test("a magic link, a promotion, and the dashboard", async ({ page }) => {
    const email = await signInOrSkip(page, "admin");

    try {
      // Still an ordinary reader at this point.
      expect((await page.goto("/admin", { waitUntil: "networkidle" }))?.status()).toBe(404);

      expect(await promoteToAdmin(email)).toBe(true);

      await page.goto("/admin", { waitUntil: "networkidle" });

      await expect(page.getByTestId("admin-page")).toBeVisible();
      await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

      // The nav lists every queue, so a first visit says where to go.
      const nav = page.getByRole("navigation", { name: "Admin sections" });
      await expect(nav.getByRole("link", { name: "Reports" })).toBeVisible();
      await expect(nav.getByRole("link", { name: "Evidence" })).toBeVisible();
      await expect(nav.getByRole("link", { name: "Requests" })).toBeVisible();
    } finally {
      await demote(email);
    }
  });

  test("an admin can reach every queue the nav lists", async ({ page }) => {
    // Eight full page loads, each one compiled on demand by the dev server.
    // The mobile run of this same test finishes around 23s, which is inside the
    // default but not by enough to call it reliable — and a run that times out
    // here says nothing about whether the queues load.
    test.slow();

    const email = await signInOrSkip(page, "admin");

    try {
      expect(await promoteToAdmin(email)).toBe(true);

      for (const path of [
        "/admin/reports",
        "/admin/evidence",
        "/admin/playbooks",
        "/admin/collections",
        "/admin/use-cases",
        "/admin/requests",
        "/admin/feedback",
      ]) {
        const response = await page.goto(path, { waitUntil: "networkidle" });

        expect(response?.status(), `${path} should load for an admin`).toBe(200);
        await expect(page.getByTestId("admin-page")).toBeVisible();
      }
    } finally {
      await demote(email);
    }
  });
});

test.describe("moderation moves the public page", () => {
  test("approving shows the report and rejecting takes it away", async ({ page }) => {
    // The one test here that does the most work: a magic-link sign-in, a
    // promotion, a queued report, an approval, a rejection, and four full page
    // loads to prove the public page moved each time. Against the dev server
    // that is comfortably past Playwright's 30s default, and the failure mode
    // when it expires is a timeout rather than a claim about moderation — which
    // is the least useful thing this suite could report. `test.slow` triples
    // the timeout rather than naming a number, so it stays right if the
    // project's default ever changes.
    test.slow();

    const email = await signInOrSkip(page, "admin");

    if (!adminClient()) {
      test.skip(true, "needs SUPABASE_SERVICE_ROLE_KEY");
    }

    let reportId: string | null = null;

    try {
      expect(await promoteToAdmin(email)).toBe(true);

      const userId = await userIdFor(email);
      const report = await queuePendingReport(SLUG, userId);
      expect(report).not.toBeNull();
      reportId = report!.id;

      // Pending: the queue shows it, and the public page does not count it.
      await page.goto(`/admin/reports?status=pending`, { waitUntil: "networkidle" });
      await expect(page.getByTestId("report-row").filter({ hasText: report!.note })).toHaveCount(1);

      await page.goto(`/p/${SLUG}`, { waitUntil: "networkidle" });
      const before = await approvedCountOnPublicPage(page);

      // Approve it.
      //
      // Back to the queue first, and the row locator is rebuilt rather than
      // held: a Playwright locator is a *query*, not a reference to an element,
      // so one captured above is re-evaluated against whatever page the browser
      // is on now. Clicking it after navigating to `/p/<slug>` therefore looks
      // for the approve button on the public page, finds nothing, and waits out
      // the whole test timeout — a failure that reads like the button is broken
      // rather than like the test asked the wrong page.
      await page.goto(`/admin/reports?status=pending`, { waitUntil: "networkidle" });
      const pendingRow = page.getByTestId("report-row").filter({ hasText: report!.note });
      await expect(pendingRow).toHaveCount(1);
      await pendingRow.getByTestId("report-approve").click();
      await expect(pendingRow).toHaveCount(0, { timeout: 20_000 });

      await page.goto(`/p/${SLUG}`, { waitUntil: "networkidle" });
      expect(await approvedCountOnPublicPage(page)).toBe(before + 1);

      // Reject it, with a reason — and it goes from the public page.
      await page.goto(`/admin/reports?status=approved`, { waitUntil: "networkidle" });
      const approvedRow = page.getByTestId("report-row").filter({ hasText: report!.note });
      await approvedRow.getByTestId("report-reject").click();
      await page.getByTestId("reject-reason").fill("Filed by the test to prove this works.");
      await page.getByTestId("reject-confirm").click();

      await expect(page.getByTestId("report-row").filter({ hasText: report!.note })).toHaveCount(0, {
        timeout: 20_000,
      });

      await page.goto(`/p/${SLUG}`, { waitUntil: "networkidle" });
      expect(await approvedCountOnPublicPage(page)).toBe(before);
    } finally {
      if (reportId) {
        await deleteReport(reportId!);
      }
      await demote(email);
    }
  });

  test("a rejection cannot be saved without a reason", async ({ page }) => {
    const email = await signInWithEmailLink(page, "admin");
    if (!email || !adminClient()) {
      test.skip(true, "needs the local Supabase stack, Mailpit and SUPABASE_SERVICE_ROLE_KEY");
      // Unreachable: `test.skip` throws, but it is typed `void`, so it does not
      // narrow `string | false`. Same fix as `signInOrSkip`, for the same reason.
      throw new Error("skipped — unreachable");
    }

    try {
      expect(await promoteToAdmin(email!)).toBe(true);

      await page.goto("/admin/reports", { waitUntil: "networkidle" });

      const rejectable = page.getByTestId("report-reject").first();
      if ((await rejectable.count()) === 0) {
        test.skip(true, "no report in the queue to reject");
      }

      await rejectable.click();
      await page.getByTestId("reject-reason").fill("");
      await page.getByTestId("reject-confirm").click();

      // The dialog stays open with nothing written, which is the whole point of
      // asking: a rejection nobody can explain is a rejection of the wrong report.
      await expect(page.getByTestId("reject-reason")).toBeVisible();
      await expect(page.getByTestId("report-queue")).toBeVisible();
    } finally {
      await demote(email!);
    }
  });
});

/**
 * How many approved reports the public page says a playbook has.
 *
 * Read from the "Showing the N most recent of M reports" line, because that is
 * the only thing the public page renders about this report.
 *
 * The obvious assertion — that the report's note appears on `/p/<slug>` — does
 * not work, and it is worth saying why rather than leaving the next person to
 * rediscover it. `ReportList` renders the result, the amount, the agent and the
 * date; it never renders the note at all, anywhere outside `/admin`. So a
 * moderation test that looked for the note was asserting that the public page
 * quotes a stranger's free text, which it deliberately does not do, and the test
 * failed while the product was right.
 *
 * The count is the honest signal for the acceptance criterion. It is computed
 * from `public_reports`, the same view the list is read from, so a report that
 * becomes approved and a report that becomes rejected both move it — which is
 * precisely the claim being tested.
 */
async function approvedCountOnPublicPage(page: import("@playwright/test").Page): Promise<number> {
  const line = page.getByText(/Showing the \d+ most recent of (\d+) reports?\./);

  await expect(line).toBeVisible({ timeout: 20_000 });

  const match = /of (\d+) reports?\./.exec(await line.innerText());
  if (!match) {
    throw new Error(`Could not read a report count from: ${await line.innerText()}`);
  }

  return Number(match[1]);
}

/** The profile id behind an address, for the report's `user_id`. */
async function userIdFor(email: string): Promise<string> {
  const supabase = adminClient()!;
  const { data } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const user = data.users.find((candidate) => candidate.email === email);

  if (!user) {
    throw new Error(`No account for ${email} — the sign-in should have created one.`);
  }

  return user.id;
}