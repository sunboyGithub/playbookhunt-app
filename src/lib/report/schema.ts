import { z } from "zod";

import { AMOUNT_CAPS, REFERRAL_CODE_PATTERN, type OutcomeType } from "@/lib/report/shape";

/**
 * What the report form may send.
 *
 * Only `result` is required, and that is not a simplification — it is the whole
 * point of the form. AGENTS.md wants the ask kept small so people answer, and a
 * form that demands an amount and a note before it will accept "worked" is a
 * form that gets closed.
 *
 * Two rules here are load-bearing beyond validation:
 *
 * - **Strings are trimmed and length-capped before anything else.** The note is
 *   free text a person typed; it goes into a column that `public_reports`
 *   publishes to everyone, and an unbounded note is an unbounded thing to publish.
 * - **The amount is a finite number above zero.** `Infinity` and `NaN` both pass
 *   a naive `> 0` check and both reach Postgres as `Infinity`, which then poisons
 *   every median computed over the column.
 *
 * The cap is not applied here. It is a moderation threshold owned by the server
 * action, which files an over-cap amount as `pending` + `is_outlier` — see the
 * note on `amount` below.
 */
export function reportSchema(
  outcomeType: OutcomeType | null,
  allowedProviderOptions: string[] = [],
  allowedRegionOptions: string[] = [],
) {
  const collectsHours = outcomeType === "time_hours";

  // A playbook that measures time, a binary, or nothing at all collects no money,
  // so anything sent under `amount` is discarded rather than stored. The form
  // keeps one field and sends it under both keys, so the number a reader typed
  // into "how many hours?" arrives as `amount` too — and a number nobody was
  // offered, in the column the money medians are computed from, is worse than no
  // number at all.
  const collectsMoney =
    outcomeType !== null && outcomeType !== "binary" && outcomeType !== "time_hours";

  const number = z
    .union([z.number(), z.string(), z.null(), z.undefined()])
    .transform((value) => {
      if (value === null || value === undefined || value === "") return null;
      const parsed = typeof value === "number" ? value : Number(value);
      return Number.isFinite(parsed) ? parsed : Number.NaN;
    })
    // Above-zero and finite. Deliberately *not* "and no more than the cap".
    //
    // The cap is a moderation threshold, not a validity rule: the brief says an
    // amount over the playbook's cap is filed as `pending` + `is_outlier`, which
    // only makes sense if the amount is accepted in the first place. Rejecting
    // it would tell somebody who genuinely saved $700 that their saving is not a
    // valid saving, and the most likely result is a smaller number they do not
    // believe — which is worse for the median than a large one flagged for
    // review. The cap is applied by the server action, which sets the status.
    .refine((value) => value === null || (Number.isFinite(value) && value > 0), {
      message: "Enter a number above 0.",
    })
    .optional()
    .default(null);

  const money = collectsMoney
    ? number
    : // `z.any()` rather than `z.null()` so a number that arrives anyway is
      // dropped instead of failing the whole submission: the reader's *result* is
      // the thing we asked for, and refusing it over a field they were never
      // offered loses the report as well as the number.
      z.any().optional().transform((): null => null);

  // The same rule for hours, and it has to be the same rule. The form keeps one
  // amount field and renders either the money or the hours input from it, so it
  // sends whichever value was typed under *both* keys. A strict `z.null()` here
  // therefore rejected every report on a money playbook with "expected null,
  // received string" — a whole outcome type lost to a field the reader never saw.
  const hours = collectsHours ? number : z.any().optional().transform((): null => null);

  return z.object({
    playbookId: z.string().uuid(),
    versionId: z.string().uuid(),

    result: z.enum(["worked", "partly", "didnt"], {
      error: "Pick one: worked, partly, or didn't.",
    }),

    /** A slug, resolved to an id server-side. Never anything the reader typed. */
    agentSlug: z
      .string()
      .trim()
      .regex(/^[a-z0-9-]+$/, "Unknown agent.")
      .nullish()
      .default("muse"),

    amount: money,
    hoursSaved: hours,

    timeSpentBucket: z
      .enum(["lt15", "15_30", "30_60", "1_2h", "2h_plus"])
      .nullish()
      .default(null),

    provider: optionField(allowedProviderOptions),
    region: optionField(allowedRegionOptions),

    note: z
      .string()
      .trim()
      .max(500, "Keep it to 500 characters.")
      .nullish()
      .transform((value) => (value ? value : null))
      .default(null),

    referralCode: z
      .string()
      .trim()
      .transform((value) => (value ? value.toUpperCase() : null))
      .refine((value) => value === null || REFERRAL_CODE_PATTERN.test(value), {
        message: "6 characters, letters and numbers.",
      })
      .nullish()
      .default(null),

    /**
     * Whether the reader ticked "I've hidden account numbers and personal info".
     *
     * Only meaningful with a file, and the browser cannot verify the claim —
     * nothing can. It is recorded so that a report *with* evidence and no
     * confirmation can be told apart from one without, and rejected server-side
     * when a file is attached without it.
     */
    evidenceRedacted: z.boolean().nullish().default(false),

    /** The client's stripped, size-checked file. Read for bytes, never stored. */
    evidence: z
      .instanceof(File)
      .nullish()
      .transform((value) => (value && value.size > 0 ? value : null))
      .default(null),
  }).superRefine((report, ctx) => {
    if (!report.evidence && report.evidenceRedacted) {
      ctx.addIssue({
        code: "custom",
        path: ["evidenceRedacted"],
        message: "There is no file attached.",
      });
    }

    if (report.evidence && !report.evidenceRedacted) {
      ctx.addIssue({
        code: "custom",
        path: ["evidenceRedacted"],
        message: "Confirm you've hidden account numbers and personal info.",
      });
    }

    if (report.evidence && report.evidence.size > 5 * 1024 * 1024) {
      ctx.addIssue({
        code: "custom",
        path: ["evidence"],
        message: "That file is over 5MB.",
      });
    }
  });
}

/**
 * A free-text or enumerated field, validated against the playbook's own list.
 *
 * When the playbook declares options, a value outside them is refused. That is
 * stricter than it looks: it is what stops the provider filter on the detail
 * page from growing a "Zzzcorp" bucket because someone typed a company name
 * that was not in the list. A playbook with no options accepts any short string,
 * because a free-text field with a whitelist is a select.
 */
function optionField(allowed: string[]) {
  const base = z
    .string()
    .trim()
    .max(80)
    .nullish()
    .transform((value) => (value ? value : null))
    .default(null);

  if (allowed.length === 0) {
    return base;
  }

  return base.refine((value) => value === null || allowed.includes(value), {
    message: "Choose one of the listed options.",
  });
}

export type ReportInput = z.infer<ReturnType<typeof reportSchema>>;

/**
 * The amount above which a number is flagged rather than rejected.
 *
 * Exported so the form can show "most people report under $X" as a hint while
 * still accepting the truth. A cap shown as a suggestion and applied as a
 * moderation rule is one rule; a cap shown as a limit and applied as a validation
 * error is a different one, and the second one is the one that makes people
 * report a smaller number.
 */
export function amountCap(outcomeType: OutcomeType | null): number {
  return outcomeType ? AMOUNT_CAPS[outcomeType] : 0;
}

/**
 * Rate limit: ten reports a day.
 *
 * Enforced here, before any write, by counting the caller's own rows. It is a
 * per-user count rather than an IP count because the thing being limited is a
 * person, not a socket — and because an IP limit on an anonymous site is a
 * limit on a shared address, which is to say a limit on a library, an office or
 * a school.
 */
export const REPORTS_PER_DAY = 10;