/**
 * Copy that comes from outside the codebase.
 *
 * Anything here that names a third party's commercial terms must arrive with
 * its own URL, or it does not render. AGENTS.md requires a link to Muse's
 * official referral terms wherever a referral code is shown, and we do not have
 * that URL — inventing one would put a fabricated citation in front of every
 * reader, which is the single thing this project is built not to do.
 *
 * So `termsUrl` is empty, the referral note hides, and the block it belongs to
 * still renders everything else. Setting the URL is a one-line change and needs
 * no code edit elsewhere.
 */

export const SITE = {
  name: "PlaybookHunt",
  tagline: "Proven playbooks with real results",
} as const;

export const MUSE_REFERRAL = {
  /** Empty until Muse's official referral terms URL is supplied. See above. */
  termsUrl: "",
  note: "Bonus: add your Muse referral code to a verified report. If people join Muse with it, you could earn up to 1B Muse tokens.",
  footnote: "Per Muse's referral terms. Never affects rankings.",
} as const;

/**
 * The referral note, or null when it must not be shown.
 *
 * Returning null rather than a boolean means the caller cannot render the note
 * while forgetting the link — the "shown" decision carries the link with it.
 */
export function museReferralNote(): { note: string; footnote: string; termsUrl: string } | null {
  if (!MUSE_REFERRAL.termsUrl) {
    return null;
  }
  return {
    note: MUSE_REFERRAL.note,
    footnote: MUSE_REFERRAL.footnote,
    termsUrl: MUSE_REFERRAL.termsUrl,
  };
}

/** Rotating hero search placeholders. The first is the resting state. */
export const SEARCH_PLACEHOLDERS = [
  "Save $100 on internet bill",
  "Plan my Japan trip",
  "Find a cheaper flight",
  "Research my competitors",
] as const;

export const HERO_QUICK_LINKS = [
  { label: "Best results 2026", href: "/playbooks?sort=best_evidence" },
  { label: "Trending", href: "/playbooks?sort=trending" },
  { label: "Recently verified", href: "/playbooks?sort=recently_verified" },
] as const;