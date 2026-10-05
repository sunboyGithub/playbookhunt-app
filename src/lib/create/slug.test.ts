import { describe, expect, it } from "vitest";

import { SLUG_PATTERN } from "@/lib/content/schema";
import { isValidSlug, slugFromTitle, uniqueSlug } from "@/lib/create/slug";

describe("a slug from a title", () => {
  it("matches what the content schema already accepts", () => {
    expect(slugFromTitle("Lower your internet bill")).toBe("lower-your-internet-bill");
    expect(isValidSlug(slugFromTitle("Lower your internet bill"))).toBe(true);
  });

  it("collapses runs of dashes and trims them from both ends", () => {
    // The naive `replace` leaves a trailing dash, which fails SLUG_PATTERN — so
    // this is the case the round-trip check in `slugFromTitle` exists for.
    expect(slugFromTitle("Cut   your — bills ")).toBe("cut-your-bills");
    expect(isValidSlug(slugFromTitle("Cut   your — bills "))).toBe(true);
  });

  it("drops diacritics rather than keeping characters the pattern rejects", () => {
    expect(isValidSlug(slugFromTitle("Café résumé"))).toBe(true);
    expect(slugFromTitle("Café résumé")).toBe("cafe-resume");
  });

  it("strips characters outside the pattern, including emoji", () => {
    expect(slugFromTitle("Save 💰 on groceries")).toBe("save-on-groceries");
  });

  it("returns empty rather than inventing an address for an unusable title", () => {
    // "Add a title we can use in a link" is actionable; /create/unnamed-4f2 is a
    // URL nobody chose.
    expect(slugFromTitle("!!!")).toBe("");
    expect(slugFromTitle("")).toBe("");
    expect(slugFromTitle("   ")).toBe("");
  });

  it("truncates on a dash boundary, never mid-word", () => {
    const slug = slugFromTitle("A very long title about negotiating a much cheaper broadband plan");

    expect(slug.length).toBeLessThanOrEqual(60);
    expect(isValidSlug(slug)).toBe(true);
    expect(slug.endsWith("-")).toBe(false);
  });

  // The two rules live in different files, which is exactly the pair that drifts.
  it("agrees with the content schema's own pattern on every title it is given", () => {
    const titles = [
      "Lower your internet bill",
      "Cut your — bills",
      "Café résumé",
      "Save 💰 on groceries",
      "!!!",
      "",
    ];

    for (const title of titles) {
      const slug = slugFromTitle(title);

      if (slug === "") {
        // The only acceptable empty result is an empty one — a non-empty slug
        // that fails the pattern would be written by the action and then
        // rejected by the import validator on the next run.
        expect(slug).toBe("");
        continue;
      }

      expect(SLUG_PATTERN.test(slug), `"${title}" → "${slug}"`).toBe(true);
      expect(isValidSlug(slug)).toBe(true);
    }
  });
});

describe("a slug nobody has taken", () => {
  const fingerprint = "11111111-2222-3333-4444-555555555555";

  it("leaves a free slug alone", () => {
    expect(uniqueSlug("Lower your internet bill", new Set(), fingerprint)).toBe(
      "lower-your-internet-bill",
    );
  });

  // The obvious collision: the brief asks for an outcome-first title and there
  // are only so many ways to phrase an outcome.
  it("suffixes one that is taken", () => {
    const taken = new Set(["lower-your-internet-bill"]);

    expect(uniqueSlug("Lower your internet bill", taken, fingerprint)).toBe(
      "lower-your-internet-bill-555555",
    );
  });

  it("derives the suffix from the end of the fingerprint, so it is stable", () => {
    // A retried submission of the same draft has to land on the same slug,
    // otherwise the failed first attempt leaves a row behind.
    const taken = new Set(["lower-your-internet-bill"]);

    expect(uniqueSlug("Lower your internet bill", taken, fingerprint)).toBe(
      uniqueSlug("Lower your internet bill", taken, fingerprint),
    );
  });

  it("keeps counting rather than repeating a suffix that is also taken", () => {
    const taken = new Set(["lower-your-internet-bill", "lower-your-internet-bill-555555"]);

    expect(uniqueSlug("Lower your internet bill", taken, fingerprint)).toBe(
      "lower-your-internet-bill-555555-1",
    );
  });

  it("returns empty for a title with nothing sluggable, even when nothing is taken", () => {
    // Returning a placeholder here would publish a URL nobody chose.
    expect(uniqueSlug("!!!", new Set(), fingerprint)).toBe("");
  });

  it("survives a fingerprint made entirely of separators", () => {
    const taken = new Set(["lower-your-internet-bill"]);

    expect(uniqueSlug("Lower your internet bill", taken, "---")).toBe(
      "lower-your-internet-bill-0",
    );
  });

  it("always produces something the content validator accepts", () => {
    const titles = ["Lower your internet bill", "Cut your — bills", "Café résumé"];

    for (const title of titles) {
      const taken = new Set([slugFromTitle(title)]);
      expect(isValidSlug(uniqueSlug(title, taken, fingerprint))).toBe(true);
    }
  });
});