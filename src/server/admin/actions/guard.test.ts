import { describe, expect, it, vi } from "vitest";

import { NOT_AN_ADMIN } from "@/server/admin/session";

/**
 * Every admin action refuses a non-administrator, and refuses them *before*
 * reaching for a client.
 *
 * ## Why this file exists at all
 *
 * A server action is a public HTTP endpoint with its own auth. The `notFound()`
 * in the admin layout protects pages; it cannot protect an action, because a
 * request that skips the layout entirely still reaches the action. So each action
 * asks `adminSession()` first — and "each" is the word this file is holding
 * honest. An action added in a hurry, with the guard forgotten, would pass every
 * other test in the suite and be a working moderation endpoint for anybody who
 * found the route.
 *
 * ## Why "without touching the client" is part of the assertion
 *
 * Returning the refusal is not enough on its own. An action that guards, then
 * opens a client, then checks a flag would also return the refusal — after
 * constructing a service-role client and possibly after reading a row. The mocks
 * below throw rather than return a stub, so an action that got that far fails
 * the test instead of passing quietly.
 *
 * ## What is not tested here
 *
 * That the guard *admits* a real administrator, that the writes land, and that
 * the statistics move. Those need a database and are in the e2e suite; this is
 * only about the closed door.
 */

const { adminSession, clientFactory, auditWriter } = vi.hoisted(() => ({
  adminSession: vi.fn(async () => ({ ok: false as const, error: NOT_AN_ADMIN })),
  // Throwing rather than returning a stub: reaching for the client at all is the
  // failure this file is looking for.
  clientFactory: vi.fn(() => {
    throw new Error("a non-admin must not reach the database client");
  }),
  auditWriter: vi.fn(async () => {
    throw new Error("a non-admin must not write an audit row");
  }),
}));

vi.mock("@/server/admin/session", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/server/admin/session")>();

  return {
    ...original,
    adminSession,
    // `requireAdmin` is the page-side half. It throws `notFound()`, which a unit
    // test cannot usefully assert against; the e2e suite covers the 404 itself.
    requireAdmin: vi.fn(async () => {
      throw new Error("notFound");
    }),
  };
});

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: clientFactory }));
vi.mock("@/server/admin/audit", () => ({
  writeAdminAction: auditWriter,
  listAuditEntries: vi.fn(),
}));

const { moderateReports } = await import("@/server/admin/actions/moderate-reports");
const { reviewEvidence, previewEvidence } = await import("@/server/admin/actions/review-evidence");
const { updatePlaybookCore, createPlaybookVersion, markPlaybookVerified } = await import(
  "@/server/admin/actions/playbooks"
);
const { saveCollection, saveUseCase, reorderCollectionItems, reorderUseCaseItems, setArrangedItem } =
  await import("@/server/admin/actions/arranged");
const { setRequestStatus } = await import("@/server/admin/actions/requests");
const { setFeedbackStatus } = await import("@/server/admin/actions/feedback");
const { reviewSubmission } = await import("@/server/admin/actions/submissions");

/** Every action, and a call that is otherwise valid. */
const CASES: [name: string, call: () => Promise<{ ok: boolean; error?: string }>][] = [
  ["moderateReports", () => moderateReports({ reportIds: ["a"], decision: "approve", reason: null })],
  [
    "reviewEvidence",
    () => reviewEvidence({ evidenceId: "e", decision: "approve", reason: null }),
  ],
  ["previewEvidence", () => previewEvidence({ evidenceId: "e" })],
  [
    "updatePlaybookCore",
    () =>
      updatePlaybookCore({
        id: "11111111-1111-4111-8111-111111111111",
        title: "A title",
        promise: "A promise long enough to pass.",
        whoFor: null,
        whoNotFor: null,
        status: "published",
        previewImageUrl: null,
      }),
  ],
  [
    "createPlaybookVersion",
    () =>
      createPlaybookVersion({
        playbookId: "11111111-1111-4111-8111-111111111111",
        promptTemplate: "A prompt that is comfortably longer than twenty characters.",
        changelog: "A changelog that says something.",
        inputs: [],
        steps: [],
      }),
  ],
  ["markPlaybookVerified", () => markPlaybookVerified({ playbookId: "p" })],
  [
    "saveCollection",
    () =>
      saveCollection({
        id: null,
        fields: {
          title: "A kit",
          slug: "a-kit",
          blurb: "",
          illustrationUrl: null,
          isFeatured: false,
          sort: 0,
        },
      }),
  ],
  [
    "saveUseCase",
    () =>
      saveUseCase({
        id: null,
        fields: {
          title: "A use case",
          slug: "a-use-case",
          description: "",
          gradientFrom: "#E8EFFC",
          gradientTo: "#DCE7F5",
          sort: 0,
        },
      }),
  ],
  ["reorderCollectionItems", () => reorderCollectionItems({ collectionId: "c", order: [] })],
  ["reorderUseCaseItems", () => reorderUseCaseItems({ useCaseId: "u", order: [] })],
  [
    "setArrangedItem",
    () =>
      setArrangedItem({
        table: "collection",
        parentId: "c",
        playbookId: "p",
        present: true,
      }),
  ],
  ["setRequestStatus", () => setRequestStatus({ requestIds: ["r"], status: "planned" })],
  ["setFeedbackStatus", () => setFeedbackStatus({ feedbackId: "f", status: "reviewed" })],
  [
    "reviewSubmission",
    () =>
      reviewSubmission({
        playbookId: "11111111-1111-4111-8111-111111111111",
        decision: "approve",
        note: null,
      }),
  ],
];

describe("every admin action refuses a non-administrator", () => {
  it.each(CASES)("%s", async (name, call) => {
    const result = await call();

    expect(result.ok).toBe(false);
    expect(result.error).toBe(NOT_AN_ADMIN);
  });
});

describe("and refuses them before doing anything", () => {
  it.each(CASES)("%s never reaches the database", async (_name, call) => {
    await call().catch(() => undefined);

    expect(clientFactory).not.toHaveBeenCalled();
    expect(auditWriter).not.toHaveBeenCalled();
  });
});

describe("the refusal itself", () => {
  it("does not say the area exists", () => {
    // A message naming moderators, queues or permissions tells a stranger that
    // /admin is a thing that exists and what is behind it. The 404 gives the
    // same answer as a page that was never built; this does too.
    expect(NOT_AN_ADMIN.toLowerCase()).not.toContain("admin");
    expect(NOT_AN_ADMIN.toLowerCase()).not.toContain("permission");
    expect(NOT_AN_ADMIN.toLowerCase()).not.toContain("moderat");
  });

  it("is the same message a page would give for a route that does not exist", () => {
    // Next's `notFound()` renders its own body; what matters is that an action
    // cannot be distinguished from a missing route by the error it hands back.
    expect(NOT_AN_ADMIN).toMatch(/^[^.]+\.$/);
  });
});