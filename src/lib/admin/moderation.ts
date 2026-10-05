import { z } from "zod";

/**
 * What an administrator may do to a report, and what they have to say about it.
 *
 * Only the decision is validated here — never the report's own fields. An admin
 * moderating a report does not get to change `result` or `amount`, because a
 * number nobody filed is a number nobody stands behind, and the whole point of
 * this milestone is that the published statistics are the ones the reporters
 * wrote. The admin chooses whether the report counts, and says why.
 *
 * Pure, and deliberately without `server-only`, so the moderation queues and the
 * actions that serve them validate against the same object.
 */

/** A moderation outcome, as the queue buttons spell it. */
export const REPORT_DECISIONS = [
  "approve",
  "reject",
  "flag_outlier",
  "unflag_outlier",
] as const;

export type ReportDecision = (typeof REPORT_DECISIONS)[number];

/** What each decision does to the row, in one place. */
export const REPORT_DECISION_EFFECT: Record<ReportDecision, string> = {
  approve: "The report counts towards the published numbers again.",
  reject: "The report is kept but stops counting, and disappears from the public page.",
  flag_outlier: "The report is excluded from the aggregates as implausible, but stays public.",
  unflag_outlier: "The report counts towards the aggregates again.",
};

/** Long enough to say why, short enough that nobody skips it to get past it. */
export const MODERATION_NOTE_MAX = 500;

/**
 * Reasons offered as one-click buttons.
 *
 * A free-text-only reason field gets "spam", which is worse than no reason: it
 * reads as a judgement on the reporter rather than on the report. These are
 * phrased as statements about the data, and the field stays open — a moderator
 * with a reason none of these cover can still write it, which is the only way to
 * keep the list from being a menu of the reasons that are easy to categorise.
 */
export const QUICK_REJECTION_REASONS = [
  "Amount looks like a guess rather than a measured figure",
  "Describes a different task from the playbook's",
  "Duplicate of an earlier report",
  "Contains personal information about somebody else",
] as const;

/** The outcomes an evidence file can have. */
export const EVIDENCE_DECISIONS = ["approve", "reject"] as const;
export type EvidenceDecision = (typeof EVIDENCE_DECISIONS)[number];

const note = z
  .string()
  .trim()
  .max(MODERATION_NOTE_MAX, "Keep the reason under 500 characters.")
  .transform((value) => (value.length === 0 ? null : value));

/**
 * One decision about one report, plus one reason.
 *
 * The reason is required for `reject` and optional everywhere else. That is a
 * deliberate asymmetry: a rejection takes a report out of the numbers somebody
 * else may have acted on, and the reporter deserves to know why, whereas an
 * approval needs no justification and demanding one produces the phrase "looks
 * fine" several hundred times over.
 */
export const moderationSchema = z
  .object({
    decision: z.enum(REPORT_DECISIONS),
    reason: note.nullish(),
  })
  .superRefine((value, ctx) => {
    if (value.decision === "reject" && !value.reason) {
      ctx.addIssue({
        code: "custom",
        path: ["reason"],
        message: "Say why this report is being rejected — the reason stays private.",
      });
    }
  });

export type ModerationInput = z.infer<typeof moderationSchema>;

/** The same shape, for a file attached to a report. */
export const evidenceReviewSchema = z
  .object({
    decision: z.enum(EVIDENCE_DECISIONS),
    reason: note.nullish(),
  })
  .superRefine((value, ctx) => {
    if (value.decision === "reject" && !value.reason) {
      ctx.addIssue({
        code: "custom",
        path: ["reason"],
        message: "Say why this evidence is being rejected — the reporter cannot see this.",
      });
    }
  });

export type EvidenceReviewInput = z.infer<typeof evidenceReviewSchema>;

/**
 * How long an evidence preview link lives.
 *
 * Short on purpose. The file is in a private bucket and the only way to see it
 * is a signed URL, which is a bearer token for that one object — so the window
 * is sized to reading one screenshot, not to a working session. The page that
 * mints it is never cached, so the link is not sitting in a shared cache either.
 */
export const EVIDENCE_URL_TTL_SECONDS = 300;

/**
 * The message a reader is shown when their report was rejected.
 *
 * It does not include the reason. The reason is a note to moderators about one
 * report; showing it to the reporter would turn "we are not publishing this
 * number" into "here is how we judged you", and the only thing the reporter can
 * do about either is nothing.
 */
export const REJECTION_NOTICE =
  "This report is not being counted. If you think that is a mistake, write to us from the address you filed it with and we will look again.";