import { expect, test } from "@playwright/test";

import { signInOrSkip, signInWithEmailLink } from "./support/auth";
import { adminClient } from "./support/db";
import { deleteReport, demote, promoteToAdmin, queuePendingReport } from "./support/admin";
import { withDbLock } from "./support/lock";

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
 * ## Why the database writes take the lock
 *
 * `desktop` and `mobile` run concurrently in separate processes against one
 * database. Queueing a report and moderating it from both would race. Every body
 * that writes takes `withDbLock`, and every one cleans up in a `finally` — a
 * leftover admin account or sentinel report would be a state the next run
 * inherits.
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

      await withDbLock(async () => {
        expect(await promoteToAdmin(email)).toBe(true);
      });

      await page.goto("/admin", { waitUntil: "networkidle" });

      await expect(page.getByTestId("admin-page")).toBeVisible();
      await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

      // The nav lists every queue, so a first visit says where to go.
      const nav = page.getByRole("navigation", { name: "Admin sections" });
      await expect(nav.getByRole("link", { name: "Reports" })).toBeVisible();
      await expect(nav.getByRole("link", { name: "Evidence" })).toBeVisible();
      await expect(nav.getByRole("link", { name: "Requests" })).toBeVisible();
    } finally {
      await withDbLock(() => demote(email));
    }
  });

  test("an admin can reach every queue the nav lists", async ({ page }) => {
    const email = await signInOrSkip(page, "admin");

    try {
      await withDbLock(async () => {
        expect(await promoteToAdmin(email)).toBe(true);
      });

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
      await withDbLock(() => demote(email));
    }
  });
});

test.describe("moderation moves the public page", () => {
  test("approving shows the report and rejecting takes it away", async ({ page }) => {
    const email = await signInOrSkip(page, "admin");

    if (!adminClient()) {
      test.skip(true, "needs SUPABASE_SERVICE_ROLE_KEY");
    }

    let reportId: string | null = null;

    try {
      await withDbLock(async () => {
        expect(await promoteToAdmin(email)).toBe(true);
      });

      const userId = await userIdFor(email);
      const report = await withDbLock(() => queuePendingReport(SLUG, userId));
      expect(report).not.toBeNull();
      reportId = report!.id;

      // Pending: the queue shows it, and the public page does not.
      await page.goto(`/admin/reports?status=pending`, { waitUntil: "networkidle" });
      const row = page.getByTestId("report-row").filter({ hasText: report!.note });
      await expect(row).toHaveCount(1);

      await page.goto(`/p/${SLUG}`, { waitUntil: "networkidle" });
      await expect(page.getByText(report!.note)).toHaveCount(0);

      // Approve it.
      await row.getByTestId("report-approve").click();
      await expect(row).toHaveCount(0, { timeout: 20_000 });

      await page.goto(`/p/${SLUG}`, { waitUntil: "networkidle" });
      await expect(page.getByText(report!.note)).toHaveCount(1);

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
      await expect(page.getByText(report!.note)).toHaveCount(0);
    } finally {
      if (reportId) {
        await withDbLock(() => deleteReport(reportId!));
      }
      await withDbLock(() => demote(email));
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
      await withDbLock(async () => {
        expect(await promoteToAdmin(email!)).toBe(true);
      });

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
      await withDbLock(() => demote(email!));
    }
  });
});

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