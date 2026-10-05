import type { Page } from "@playwright/test";

import { adminClient } from "./db";
import { withDbLock } from "./lock";

/**
 * Driving `/create` to the point where it will submit.
 *
 * This lives in `support/` rather than in `create.spec.ts` because the review
 * round trip in `admin.spec.ts` needs the same journey — a reviewer can only be
 * given something to review if a creator made it, and that has to happen through
 * the form rather than by inserting rows, or the test would be reviewing a shape
 * the product never produces.
 */

export const TITLE = "Lower your internet bill";

/**
 * Fill every field the submission schema requires, and nothing optional.
 *
 * All five are required by `submissionSchema`, and each one is filled the way a
 * person would fill it. An earlier draft of this helper left the first input's
 * name blank, and three tests failed with "User input 1 needs a name." — which
 * was the schema doing its job and the helper quietly not doing its own. The
 * name is here for the same reason the title is: a submission without it is not
 * a submission.
 */
export async function fillPlaybook(page: Page, title = TITLE): Promise<void> {
  await page.goto("/create", { waitUntil: "networkidle" });

  await page.getByTestId("create-field-title").fill(title);
  await page.getByTestId("create-field-promise").fill(
    "Cut the monthly cost without changing your plan.",
  );

  // The category and outcome are selects, and the schema refuses a submission
  // without both — so a test that skipped them would be testing the wrong error.
  await page.getByTestId("create-field-categoryId").click();
  await page.getByRole("option").first().click();

  await page.getByTestId("create-field-outcomeType").click();
  await page.getByRole("option").first().click();

  await page.locator('[data-testid="create-input-input_1_placeholder"] input').first().fill(
    "Internet provider",
  );
}

/** What a submission left in the database, resolved from the author's side. */
export type SubmittedPlaybook = {
  playbookId: string;
  slug: string;
};

/**
 * Find the playbook a signed-in creator has most recently put into review.
 *
 * Scoped by author and to drafts that are now linked to a playbook. An unscoped
 * "most recent draft" is the newest row *anybody* wrote, and this suite runs the
 * desktop and mobile projects concurrently against one database — that
 * ambiguity shows up as a test that fails only when it runs in a particular
 * order.
 */
export async function latestSubmissionFor(email: string): Promise<SubmittedPlaybook | null> {
  const client = adminClient();
  if (client === null) return null;

  const { data: users } = await client.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const user = users.users.find((candidate) => candidate.email === email);

  if (!user) return null;

  const { data: draft } = await client
    .from("playbook_drafts")
    .select("playbook_id")
    .eq("author_id", user.id)
    .not("playbook_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!draft?.playbook_id) return null;

  const { data: playbook } = await client
    .from("playbooks")
    .select("id, slug")
    .eq("id", draft.playbook_id)
    .maybeSingle();

  if (!playbook) return null;

  return { playbookId: playbook.id, slug: playbook.slug };
}

/**
 * Remove a submitted playbook and everything hanging off it.
 *
 * Locked for the same reason the other writes are, and ordered for a reason that
 * is easy to get wrong: `playbooks.current_version_id` is a *composite* foreign key
 * into `playbook_versions`, so the referencing row has to go before the rows it
 * references. Deleting the versions first fails with a foreign key violation that
 * reads like a schema bug.
 *
 * Best-effort, like the rest of the suite's cleanup — a test that times out never
 * reaches its `finally`.
 */
export async function deleteSubmittedPlaybook(playbookId: string): Promise<void> {
  const client = adminClient();
  if (client === null) return;

  await withDbLock(async () => {
    await client.from("playbooks").delete().eq("id", playbookId);
    await client.from("playbook_versions").delete().eq("playbook_id", playbookId);
    await client.from("playbook_submissions").delete().eq("playbook_id", playbookId);
    await client.from("playbook_drafts").delete().eq("playbook_id", playbookId);
    await client.from("playbook_agents").delete().eq("playbook_id", playbookId);
    await client.from("playbook_sources").delete().eq("playbook_id", playbookId);
  });
}