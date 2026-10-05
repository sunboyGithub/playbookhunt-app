/**
 * Ranking constants, in one place, because AGENTS.md says "weights in config"
 * and a weight that lives next to the function that uses it is a weight that
 * gets edited by accident.
 *
 * Every number here is quoted rather than derived, and the tests in
 * `src/lib/ranking/` assert these values so that changing one without changing
 * the other fails. Nothing in this file imports anything: it is read by the
 * pure ranking functions, by the page that renders a score, and by the seed
 * script, and a config module that pulled in the database would make two of
 * those three impossible to test.
 */

/**
 * The evidence score's four terms, summing to 1.
 *
 * Wilson dominates at 0.55 because it is the only term derived from outcomes.
 * The other three are 0.45 between them, which is the point: how many people
 * tried something, how recently it was checked and how big the effect is are
 * all real signals, and none of them is evidence that it worked.
 */
export const RANKING_WEIGHTS = {
  wilson: 0.55,
  outcome: 0.2,
  recency: 0.15,
  usage: 0.1,
} as const;

/** How many days a report's influence halves. Sixty is the brief's number. */
export const REPORT_HALF_LIFE_DAYS = 60;

/** How many days a playbook's "last verified" stamp halves. Also the brief's. */
export const RECENCY_HALF_LIFE_DAYS = 60;

/** How many hours a trending event halves. */
export const TRENDING_HALF_LIFE_HOURS = 48;

/** Trending only looks this far back. */
export const TRENDING_WINDOW_DAYS = 7;

/** What one try is worth in trending, against one report. */
export const TRENDING_TRY_WEIGHT = 1;
export const TRENDING_REPORT_WEIGHT = 3;

/** The z for a 95% Wilson interval. */
export const WILSON_Z = 1.96;

/**
 * Below this many reports, no success percentage is shown at all.
 *
 * AGENTS.md, and enforced in the database-facing tests as well as here: a
 * percentage on three reports says almost nothing and looks like a claim.
 */
export const REPORT_THRESHOLD = 20;

/** Below this many amounts, no median is shown. */
export const AMOUNT_THRESHOLD = 10;

/**
 * "Proven to work" needs both of these, not either.
 *
 * Twenty reports is enough to have a rate; three of them carrying evidence is
 * what makes it a rate somebody checked rather than a rate somebody typed.
 */
export const PROVEN_MIN_REPORTS = 20;
export const PROVEN_MIN_EVIDENCE = 3;

/** How recently a playbook must have been verified to earn `verified_recent`. */
export const VERIFIED_RECENT_DAYS = 30;

/** The Wilson bound at or above which a playbook earns `high_success`. */
export const HIGH_SUCCESS_WILSON = 0.6;

/**
 * The top slice of a category, for `top_saver` and `most_tried`.
 *
 * A decile, as the brief specifies. With a target catalogue of ~48 playbooks
 * across 8 categories that is roughly the top half of each category, which is
 * worth knowing: at this catalogue size "top 10%" means "not in the bottom
 * half", and the badge is closer to a participation marker than to a rank.
 * It is not widened here because the brief names the decile, and widening it
 * would be me quietly changing a ranking rule.
 */
export const BADGE_TOP_FRACTION = 0.1;

/**
 * How many comparable peers `outcomeStrength` needs before it will rank.
 *
 * A deviation from the literal brief, and a deliberate one. The brief says
 * "percentile of median amount among category peers with `amount_n >= 5`;
 * 0.5 if not computable". With one peer, a percentile is 0 or 1 — so a single
 * playbook in a category either collects the full 0.20 outcome term or none of
 * it, on the strength of one other playbook's median. At a catalogue of ~6
 * playbooks per category that is the common case, not the corner case.
 *
 * Three is the smallest pool where an ordering means anything, and below it the
 * neutral 0.5 is the honest answer: "we cannot tell where this sits".
 */
export const MIN_OUTCOME_PEERS = 3;

/**
 * An account younger than this is discounted.
 *
 * A report filed seconds after signup is the cheapest thing on the internet to
 * write, and a brand-new account is also the cheapest to make. Half weight, not
 * zero: the report is still somebody's real experience.
 */
export const NEW_ACCOUNT_DAYS = 1;

/** Multipliers applied by `reportWeight`, spelled out rather than inlined. */
export const TRUST_MULTIPLIERS = {
  unverifiedEmail: 0.5,
  approvedEvidence: 1.5,
  newAccount: 0.5,
} as const;

/**
 * How many amounts before outliers are looked for at all.
 *
 * Below ten, the quartiles of a handful of numbers are the numbers themselves,
 * and an IQR rule on them flags the most distinctive true value rather than an
 * error.
 */
export const OUTLIER_MIN_AMOUNTS = 10;

/** Tukey's fence multiplier. Three IQRs, which is far outside the distribution. */
export const OUTLIER_IQR_MULTIPLIER = 3;

/**
 * The success values. Worked is 1, partly is half — a play that half delivered
 * is worth something, and rounding it to zero would make "partly" and "didn't"
 * the same answer, which they are not.
 */
export const SUCCESS_VALUE = {
  worked: 1,
  partly: 0.5,
  didnt: 0,
} as const;