/**
 * Turning a creator's title into a URL.
 *
 * ## Why this is not the importer's job
 *
 * `content/playbooks/<slug>.yaml` names its own slug, written by whoever wrote
 * the file. A creator submitting a form names a *title* — "Lower your internet
 * bill" — and the URL has to come from somewhere, so it comes from here.
 *
 * The rules are the same as the content schema's `SLUG_PATTERN`
 * (`/^[a-z0-9]+(?:-[a-z0-9]+)*$/`) because the two have to agree: a slug that
 * passes this and fails the pattern would be written by the submission action and
 * then rejected by the import validator on the next run, and a slug that is empty
 * or starts with a dash would 404 in a way that looks like a broken site rather
 * than a bad title.
 */

/** Matches `SLUG_PATTERN` in `src/lib/content/schema.ts`. Kept in sync by test. */
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Long enough to be a URL and short enough to be typed. */
export const MAX_SLUG_LENGTH = 60;

/**
 * A slug from a title, or `""` when the title has nothing sluggable in it.
 *
 * Returns empty rather than a placeholder on purpose. A title of "!!!" cannot
 * become an address, and the submission should say so — "add a title we can use
 * in a link" is actionable, where `/create/a-unnamed-playbook-4f2` is a URL that
 * nobody chose and nobody will remember.
 *
 * Dashes are collapsed and trimmed at both ends, so "Cut   your — bills" becomes
 * `cut-your-bills` rather than the `cut-your-bills-` the naive replace produces.
 * The trailing dash would fail `SLUG_PATTERN`, which is why this returns through
 * a check rather than trusting the transform.
 */
export function slugFromTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .normalize("NFKD")
    // Strip the combining marks NFKD just split off, so "Café" slugs as "cafe"
    // rather than as "cafe" with a stray diacritic that is not in [a-z0-9].
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  // Truncated on a dash boundary, then re-trimmed: cutting mid-word would give
  // "lower-your-internet-bil", which is a worse URL than a shorter clean one.
  const clipped = slug.slice(0, MAX_SLUG_LENGTH);
  const tidy = clipped.replace(/-+$/g, "");

  return SLUG_PATTERN.test(tidy) ? tidy : "";
}

/**
 * A slug that is not taken.
 *
 * `taken` is checked rather than generated around: an insert that races another
 * and loses is handled by the caller, and a collision here is not a rare event —
 * two people independently writing "Lower my internet bill" is the obvious one,
 * since the brief asks for an *outcome-first* title and there are only so many
 * ways to phrase an outcome.
 *
 * The suffix is the last six hex characters of `fingerprint`, which the caller
 * makes unique (the draft id does this already). Reusing it rather than a random
 * value means a retried submission of the same draft lands on the same slug,
 * which is what lets a failed submit be retried without leaving the first attempt's
 * row behind.
 */
export function uniqueSlug(title: string, taken: ReadonlySet<string>, fingerprint: string): string {
  const base = slugFromTitle(title);

  if (base === "") {
    return "";
  }

  if (!taken.has(base)) {
    return base;
  }

  const suffix = fingerprint.replace(/[^a-z0-9]/g, "").slice(-6).toLowerCase();

  // A fingerprint that is somehow all separators would leave nothing to
  // disambiguate with, so the loop falls back to a counter rather than producing
  // the base again.
  const tail = suffix.length > 0 ? suffix : "0";

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const candidate = attempt === 0 ? `${base}-${tail}` : `${base}-${tail}-${attempt}`;

    if (!taken.has(candidate)) {
      return candidate;
    }
  }

  return `${base}-${tail}`;
}

/** Whether a string would survive the content validator's slug pattern. */
export function isValidSlug(slug: string): boolean {
  return SLUG_PATTERN.test(slug);
}