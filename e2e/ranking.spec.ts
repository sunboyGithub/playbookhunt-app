import { expect, test, type Page } from "@playwright/test";

import { adminClient, pinEvidenceScores, restoreEvidenceScores } from "./support/db";
import { withDbLock } from "./support/lock";

/**
 * P9's acceptance criterion, end to end: after the aggregation job writes
 * `playbook_stats`, the order results come back in follows `evidence_score`.
 *
 * Every other ranking test is a unit test, and they are the right place for
 * almost all of it — `aggregate.test.ts` proves the arithmetic on fixtures with
 * no database in the way. What none of them can prove is the seam: that the
 * number the job writes is the number the search query reads. A column renamed
 * on one side of it, a stats row silently not being joined, a sort that fell
 * back to text rank — all invisible to a pure test and all fatal to the product.
 *
 * ## Why the scores are pinned
 *
 * Both playbooks used here have real seeded reports, so their scores come out
 * of `aggregate()` in whatever order the arithmetic produces today. Pinning them
 * to values no aggregation would produce (0.9 and 0.1, not two near neighbours)
 * makes the assertion independent of that, so a failure can only mean the order
 * is not following the column.
 *
 * And they are restored in a `finally`, because a test that leaves a developer's
 * database with a fabricated ranking is worse than a test that fails — that is
 * precisely the state the seed script used to be able to leave behind.
 *
 * ## Why every body runs under a cross-process lock
 *
 * The `desktop` and `mobile` projects run concurrently in separate processes
 * against one database, and `mode: "serial"` only orders tests inside one
 * worker. Pinning the same two rows from both would have them overwrite each
 * other mid-request. See `support/lock.ts`.
 */

const HIGH = "cheaper-car-insurance";
const LOW = "lower-your-internet-bill";

/** Where each of the two playbooks sits in the rendered result order. */
async function orderOf(page: Page, query = ""): Promise<{ high: number; low: number }> {
  await page.goto(`/playbooks${query}`, { waitUntil: "networkidle" });

  const order = await page
    .getByTestId("playbook-card")
    .evaluateAll((cards) => cards.map((card) => card.getAttribute("href") ?? ""));

  return {
    high: order.findIndex((href) => href.includes(HIGH)),
    low: order.findIndex((href) => href.includes(LOW)),
  };
}

/**
 * Pin both scores, read the order, restore — all under the lock.
 *
 * The two `toBeGreaterThanOrEqual(0)` assertions callers make matter as much as
 * the comparison between them: with both cards missing, `high` and `low` are
 * both -1 and every ordering assertion on them passes vacuously.
 */
async function pinnedOrder(
  page: Page,
  highScore: number,
  lowScore: number,
  query = "",
): Promise<{ high: number; low: number }> {
  return withDbLock(async () => {
    const pinned = await pinEvidenceScores({ [HIGH]: highScore, [LOW]: lowScore });
    try {
      return await orderOf(page, query);
    } finally {
      await restoreEvidenceScores(pinned);
    }
  });
}

test.describe("ranking order follows evidence_score", () => {
  // `adminClient()` first, deliberately: it is what loads `.env.local`, so
  // reading `process.env` before calling it would check a file that has not been
  // read yet and skip a suite whose dependencies are all present.
  test.skip(!adminClient(), "needs the local Supabase stack and SUPABASE_SERVICE_ROLE_KEY");

  test("a higher evidence score sorts first on /playbooks", async ({ page }) => {
    const { high, low } = await pinnedOrder(page, 0.9, 0.1);

    expect(high).toBeGreaterThanOrEqual(0);
    expect(low).toBeGreaterThanOrEqual(0);
    expect(high).toBeLessThan(low);
  });

  test("the order flips when the scores do", async ({ page }) => {
    // The stronger half of the criterion. A test that only checks "high comes
    // first" passes against a page that lists playbooks in slug order, or in
    // whatever order the database returned them — neither of which has ever
    // heard of evidence_score. Pinning them the other way and asserting the
    // reverse order is the version that cannot pass for the wrong reason.
    const { high, low } = await pinnedOrder(page, 0.1, 0.9);

    expect(high).toBeGreaterThanOrEqual(0);
    expect(low).toBeGreaterThanOrEqual(0);
    expect(low).toBeLessThan(high);
  });

  test("most_tried does not move when evidence_score does", async ({ page }) => {
    // The sort has to be a *different* sort. `most_tried` is not one of the
    // signals AGENTS.md forbids — popularity is real and the brief asks for the
    // sort — but if it quietly fell back to ordering by evidence "as a
    // tiebreak", pinning the scores would move it, and this fails.
    //
    // Both pin states are read inside one lock hold, because between them the
    // database has to stay exactly as this test left it, and another test
    // interleaving here would restore a score mid-comparison.
    await withDbLock(async () => {
      const pinned = await pinEvidenceScores({ [HIGH]: 0.9, [LOW]: 0.1 });
      let before: { high: number; low: number };
      let after: { high: number; low: number };

      try {
        before = await orderOf(page, "?sort=most_tried");

        // Sanity: the fixtures put cheaper-car-insurance at 1,180 tries against
        // the internet bill's 63, so most-tried-first is the *opposite* of the
        // evidence order just pinned. If the two agreed, the comparison below
        // would be vacuous.
        expect(before.high).toBeGreaterThanOrEqual(0);
        expect(before.low).toBeGreaterThanOrEqual(0);
        expect(before.high).toBeLessThan(before.low);

        await pinEvidenceScores({ [HIGH]: 0.1, [LOW]: 0.9 });
        after = await orderOf(page, "?sort=most_tried");
      } finally {
        await restoreEvidenceScores(pinned);
      }

      expect(after.high).toBe(before.high);
      expect(after.low).toBe(before.low);
    });
  });
});