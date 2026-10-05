import { describe, expect, it } from "vitest";

import {
  MODERATION_NOTE_MAX,
  QUICK_REJECTION_REASONS,
  REPORT_DECISION_EFFECT,
  REPORT_DECISIONS,
  evidenceReviewSchema,
  moderationSchema,
} from "@/lib/admin/moderation";

/**
 * The rules a moderator's click has to satisfy before it reaches the database.
 *
 * The one that matters is the reason. `reject` without a reason is refused, and
 * every other decision is allowed without one — a moderator approving a hundred
 * reports should not have written a hundred explanations, and a hundred copies of
 * "looks fine" in the audit log would be worse than no record at all.
 */

describe("moderationSchema", () => {
  it("accepts an approval with no reason", () => {
    expect(
      moderationSchema.safeParse({ reportIds: ["a"], decision: "approve", reason: null }).success,
    ).toBe(true);
  });

  it("accepts an approval with a reason", () => {
    expect(
      moderationSchema.safeParse({ reportIds: ["a"], decision: "approve", reason: "checked" })
        .success,
    ).toBe(true);
  });

  it("refuses a rejection with no reason", () => {
    const parsed = moderationSchema.safeParse({
      reportIds: ["a"],
      decision: "reject",
      reason: "   ",
    });

    expect(parsed.success).toBe(false);
  });

  it("refuses a rejection whose reason is only whitespace", () => {
    expect(
      moderationSchema.safeParse({ reportIds: ["a"], decision: "reject", reason: "\n\t " }).success,
    ).toBe(false);
  });

  it("ignores the report ids, which the action checks itself", () => {
    // The schema is about the *decision*; which reports it applies to is the
    // action's business, because the cap and the de-duplication live there. A
    // test asserting the schema refuses an empty list would be asserting
    // something it was never asked to do.
    expect(
      moderationSchema.safeParse({ reportIds: [], decision: "approve" }).success,
    ).toBe(true);
  });

  it("refuses a decision that is not one of the four", () => {
    expect(
      moderationSchema.safeParse({ reportIds: ["a"], decision: "delete" }).success,
    ).toBe(false);
  });

  it("refuses a reason longer than the column allows", () => {
    expect(
      moderationSchema.safeParse({
        reportIds: ["a"],
        decision: "approve",
        reason: "x".repeat(MODERATION_NOTE_MAX + 1),
      }).success,
    ).toBe(false);
  });

  it("treats an outlier flag as a decision that needs no reason", () => {
    for (const decision of REPORT_DECISIONS) {
      if (decision === "reject") continue;
      expect(moderationSchema.safeParse({ reportIds: ["a"], decision }).success).toBe(true);
    }
  });
});

describe("evidenceReviewSchema", () => {
  it("accepts an acceptance with no note", () => {
    expect(evidenceReviewSchema.safeParse({ decision: "approve" }).success).toBe(true);
  });

  it("refuses a rejection with no note", () => {
    expect(evidenceReviewSchema.safeParse({ decision: "reject" }).success).toBe(false);
  });
});

describe("the vocabulary", () => {
  it("gives every decision a sentence for the toast", () => {
    for (const decision of REPORT_DECISIONS) {
      expect(REPORT_DECISION_EFFECT[decision].length).toBeGreaterThan(0);
    }
  });

  it("offers quick reasons that are about the data rather than about the person", () => {
    // The failure mode this guards is a moderator typing "spam", which is a
    // judgement on the reporter. These are the phrasings the UI offers instead.
    for (const reason of QUICK_REJECTION_REASONS) {
      expect(reason.toLowerCase()).not.toContain("spam");
      expect(reason.toLowerCase()).not.toContain("idiot");
      expect(reason.length).toBeLessThanOrEqual(MODERATION_NOTE_MAX);
    }
  });
});