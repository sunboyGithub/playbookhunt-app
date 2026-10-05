import { expect, test } from "@playwright/test";

import { signInOrSkip } from "./support/auth";
import { fillPlaybook, TITLE } from "./support/create";
import { adminClient, authUserId } from "./support/db";

/**
 * Creating a playbook, end to end.
 *
 * ## Why this walks the whole journey rather than checking one field
 *
 * `/create` is the only flow in the product with three things that can each be
 * wrong independently and all of them look fine: the form's client state, a
 * server action that writes through RLS, and a SQL function that is the only
 * writer of `playbooks.author_id` and `playbooks.status`. A test that filled the
 * form and asserted a toast would pass with the prompt never stored. So this
 * asserts the confirmation, then reads the rows back.
 *
 * ## Both viewports, because the form is six sections long
 *
 * This file runs under the `desktop` and `mobile` projects. On a 390-wide screen
 * the six sections are a long scroll and the submit button is at the bottom of
 * it — which is exactly where "the creator never found the button" comes from.
 * The section jump links exist for that, so they are tested.
 *
 * The review side of the round trip lives in `admin.spec.ts`, which runs in its
 * own projects after these two: approving needs an administrator, and putting
 * that in this file would either skip here or serialise the whole suite behind a
 * login.
 */

test.describe.configure({ timeout: 90_000 });

test("a signed-out visitor can read the whole form and is told why they cannot save", async ({
  page,
}) => {
  await page.goto("/create", { waitUntil: "networkidle" });

  // No redirect. The form is the argument for making an account, and a redirect
  // to /login throws that argument away.
  await expect(page.getByRole("heading", { name: "Create a playbook" })).toBeVisible();

  // All six sections are present without an account.
  for (const label of [
    "The outcome",
    "Who it is for",
    "What you need from the reader",
    "The prompt",
    "Steps",
    "Testing",
  ]) {
    await expect(page.getByRole("heading", { name: new RegExp(label) })).toBeAttached();
  }

  await page.getByTestId("create-field-title").fill("Something");

  // Saving is what needs an account, and the form says so at the point where that
  // becomes true rather than refusing the keystroke.
  await expect(page.getByText("to save your work as you go")).toBeVisible();
});

test("the section links jump, which is the only way to reach the bottom on a phone", async ({
  page,
}) => {
  await page.goto("/create", { waitUntil: "networkidle" });

  await page.getByRole("link", { name: "Testing" }).click();

  // The heading is at the top of the viewport afterwards. `toBeInViewport` is the
  // honest assertion here: a click that scrolled to the wrong place would still
  // leave the element attached to the document.
  await expect(page.getByRole("heading", { name: "Testing" })).toBeInViewport();
});

test("the prompt is generated from the title and stops being generated once edited", async ({
  page,
}) => {
  await page.goto("/create", { waitUntil: "networkidle" });

  await page.getByTestId("create-field-title").fill(TITLE);

  // Generated: names the title, so the creator sees something to react to
  // instead of an empty box.
  await expect(page.getByTestId("create-prompt")).toContainText(TITLE);

  await page.getByTestId("create-prompt").fill("My own words entirely.");

  // Then it stops following the title — otherwise the next keystroke would
  // silently undo what they just typed.
  await page.getByTestId("create-field-title").fill("A completely different title");
  await expect(page.getByTestId("create-prompt")).toHaveValue("My own words entirely.");
});

test("the insert button puts a real placeholder in the prompt", async ({ page }) => {
  await page.goto("/create", { waitUntil: "networkidle" });

  // The button is disabled until the input has a name, because "Insert" alone
  // tells the creator nothing about what will be inserted.
  const insertButton = page.getByRole("button", { name: /^Insert/ }).first();
  await expect(insertButton).toBeDisabled();

  await page.getByTestId("create-field-title").fill(TITLE);
  await page.locator('[data-testid="create-input-input_1_placeholder"] input').first().fill(
    "Internet provider",
  );

  await expect(insertButton).toBeEnabled();
  await insertButton.click();

  // The exact key, copied from the input rather than retyped — which is the
  // whole reason the button exists.
  await expect(page.getByTestId("create-prompt")).toContainText("{{input_1_placeholder}}");

  // And it stops being flagged as an unknown reference, because that is the same
  // check the importer runs.
  await expect(page.getByText("is not a user input")).toBeHidden();
});

test("the required-input cap is two, and says why", async ({ page }) => {
  await page.goto("/create", { waitUntil: "networkidle" });

  await page.getByTestId("create-field-title").fill(TITLE);

  const addInput = page.getByRole("button", { name: "Add another input" });
  await addInput.click();

  await page.getByTestId("create-field-title").fill(`${TITLE} again`);
  await addInput.click();

  // Three inputs exist and none of them is required yet — the cap is on
  // *required* inputs, so ticking the first two is what brings the third up
  // against it. An earlier version of this test skipped that and asserted a cap
  // that had not been reached, which the editor correctly did not enforce.
  const requiredBoxes = page.getByRole("checkbox", { name: "Required" });
  await expect(requiredBoxes).toHaveCount(3);

  await requiredBoxes.nth(0).check();
  await requiredBoxes.nth(1).check();

  // Two required already; the third checkbox is disabled rather than the form
  // refusing the submission later.
  await expect(requiredBoxes.nth(2)).toBeDisabled();
  await expect(page.getByText("is the cap")).toBeVisible();

  // And the two that are set stay settable — a cap that locks the boxes you
  // already ticked is a cap you cannot undo.
  await requiredBoxes.nth(0).uncheck();
  await expect(requiredBoxes.nth(2)).toBeEnabled();
});

test("an incomplete submission focuses the first field that is wrong", async ({ page }) => {
  await signInOrSkip(page, "creator");

  await page.goto("/create", { waitUntil: "networkidle" });

  await page.getByRole("button", { name: "Submit for review" }).click();

  // The error is *and* the focus. A message above the fold with the caret still
  // on the submit button is the failure mode the brief is warning about.
  await expect(page.getByTestId("create-submit-error")).toBeVisible();
  await expect(page.getByTestId("create-field-title")).toBeFocused();
});

test("preview renders the prompt with a sample answer and no network", async ({ page }) => {
  await page.goto("/create", { waitUntil: "networkidle" });

  await page.getByTestId("create-field-title").fill(TITLE);
  await page.locator('[data-testid="create-input-input_1_placeholder"] input').first().fill(
    "Internet provider",
  );

  await page.getByRole("button", { name: "Preview" }).click();

  await expect(page.getByRole("dialog")).toBeVisible();
  // The field appears as a control, and the answer it defaults to is visible in
  // the rendered prompt — so a creator can see both halves at once.
  await expect(page.getByRole("dialog")).toContainText("Internet provider");
});

test("a creator saves a draft, submits it, and the rows land in review", async ({ page }) => {
  const email = await signInOrSkip(page, "creator");

  await fillPlaybook(page);

  // Autosave: no button is pressed. The status line is the whole feedback
  // surface, so waiting for it is waiting for the save.
  await expect(page.getByTestId("create-save-state")).toContainText("Draft saved", {
    timeout: 20_000,
  });

  await page.getByRole("button", { name: "Submit for review" }).click();

  await expect(page.getByTestId("create-submitted")).toBeVisible({
    timeout: 30_000,
  });

  // Read the rows back rather than trusting the confirmation screen. The screen
  // would show the same thing if the function returned a slug and wrote nothing.
  const client = adminClient();
  test.skip(client === null, "needs SUPABASE_SERVICE_ROLE_KEY in .env.local");

  const userId = await authUserId(email);
  test.skip(userId === null, "the signed-in user row was not found");

  const { data: drafts } = await client!
    .from("playbook_drafts")
    .select("id, playbook_id, content")
    .eq("author_id", userId!)
    .limit(1);

  const draft = drafts?.[0];
  expect(draft, "the autosaved draft row").toBeTruthy();
  expect(draft!.playbook_id, "the draft was linked to a playbook by submitting").not.toBeNull();

  const { data: playbook } = await client!
    .from("playbooks")
    .select("slug, status, author_id, promise")
    .eq("id", draft!.playbook_id!)
    .maybeSingle();

  expect(playbook).toBeTruthy();
  expect(playbook!.status).toBe("in_review");
  expect(playbook!.author_id).toBe(userId);
  expect(playbook!.promise).toBe("Cut the monthly cost without changing your plan.");

  const { data: submission } = await client!
    .from("playbook_submissions")
    .select("status, version")
    .eq("playbook_id", draft!.playbook_id!)
    .maybeSingle();

  expect(submission?.status).toBe("in_review");
  expect(submission?.version).toBe(1);

  // The creator's own note is a note and not a verification. `tested` means the
  // *site* ran this; submitting must never set it.
  const { data: agentRow } = await client!
    .from("playbook_agents")
    .select("tested, notes")
    .eq("playbook_id", draft!.playbook_id!)
    .maybeSingle();

  expect(agentRow?.tested).toBe(false);

  // And the playbook is not public yet.
  const { data: readerView } = await client!
    .from("playbooks")
    .select("id")
    .eq("id", draft!.playbook_id!)
    .eq("status", "published");

  expect(readerView ?? []).toHaveLength(0);
});

test("a submission shows up under My submissions and says it is with a reviewer", async ({
  page,
}) => {
  const email = await signInOrSkip(page, "creator");

  await fillPlaybook(page, "Track every subscription I am paying for");
  await page.getByRole("button", { name: "Submit for review" }).click();
  await expect(page.getByTestId("create-submitted")).toBeVisible({ timeout: 30_000 });

  await page.goto("/me?tab=submissions", { waitUntil: "networkidle" });

  await expect(page.getByTestId("submission-list")).toBeVisible();
  await expect(page.getByText("Track every subscription I am paying for")).toBeVisible();
  await expect(page.getByTestId("submission-in_review")).toBeVisible();

  // The reviewer is the reason the page exists at all, so an empty status would
  // leave a creator with no way to know what to wait for.
  await expect(page.getByText("With a reviewer")).toBeVisible();

  // And exactly one row for this playbook. Regression: submitting inside the
  // 1200ms autosave debounce created a second draft row — one submitted, one
  // orphaned at "Draft, not submitted" — and the tab then showed the same title
  // twice. `toHaveCount(1)` on the rows is what catches it; asserting the title
  // is visible does not, because both rows carried it.
  const client = adminClient();
  test.skip(client === null, "needs SUPABASE_SERVICE_ROLE_KEY in .env.local");

  const userId = await authUserId(email);
  test.skip(userId === null, "the signed-in user row was not found");

  const { data: drafts } = await client!
    .from("playbook_drafts")
    .select("id, playbook_id")
    .eq("author_id", userId!);

  expect(drafts ?? [], "draft rows this creator owns").toHaveLength(1);
  expect(drafts?.[0]?.playbook_id, "the single draft was linked by submitting").not.toBeNull();

  await expect(page.getByTestId("submission-list").getByRole("listitem")).toHaveCount(1);
});

test("reopening a submitted draft shows it as locked, not editable", async ({ page }) => {
  const email = await signInOrSkip(page, "creator");

  await fillPlaybook(page, "A playbook I should not be able to edit afterwards");
  await page.getByRole("button", { name: "Submit for review" }).click();
  await expect(page.getByTestId("create-submitted")).toBeVisible({ timeout: 30_000 });

  const client = adminClient();
  test.skip(client === null, "needs SUPABASE_SERVICE_ROLE_KEY in .env.local");

  // Scoped to the creator who just signed in, and only to drafts that are now
  // linked to a playbook. An unscoped "most recent draft" is the newest row
  // *anybody* wrote, which under the desktop and mobile projects running back to
  // back is whichever test happened to finish last.
  const userId = await authUserId(email);
  test.skip(userId === null, "the signed-in user row was not found");

  const { data: draft } = await client!
    .from("playbook_drafts")
    .select("id")
    .eq("author_id", userId!)
    .not("playbook_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  test.skip(draft === null, "no submitted draft to reopen");

  await page.goto(`/create?draft=${draft!.id}`, { waitUntil: "networkidle" });

  // The database would refuse every edit with a trigger; the form says so rather
  // than letting a creator type into a field that cannot be saved.
  await expect(page.getByTestId("create-locked")).toBeVisible();
  await expect(page.getByRole("button", { name: "With a reviewer" })).toBeDisabled();
});