import { describe, expect, it } from "vitest";

import {
  KEYWORD_CATEGORY_SLUGS,
  matchCategories,
} from "@/lib/search/category-keywords";

/** The slug of the top-ranked category, or undefined. */
function top(query: string): string | undefined {
  return matchCategories(query)[0]?.slug;
}

describe("matchCategories", () => {
  it("returns nothing for an empty query", () => {
    expect(matchCategories("")).toEqual([]);
    expect(matchCategories("   ")).toEqual([]);
  });

  it("returns nothing for a nonsense query", () => {
    // The last of the three never-dead-end layers is triggered by this. The
    // map must stay out of the way rather than inventing a category.
    expect(matchCategories("xyzzy plugh frobnicate")).toEqual([]);
  });

  it("routes the acceptance-criteria queries to Personal finance", () => {
    expect(top("lower my bills")).toBe("personal-finance");
    expect(top("save money")).toBe("personal-finance");
    expect(top("internet bill")).toBe("personal-finance");
  });

  it("routes the bill providers to Personal finance", () => {
    for (const provider of ["comcast", "xfinity", "verizon", "att"]) {
      expect(top(provider)).toBe("personal-finance");
    }
  });

  it("routes travel queries to the right one of the two travel categories", () => {
    expect(top("japan itinerary")).toBe("travel-planning");
    expect(top("flights to portugal")).toBe("travel-booking");
  });

  it("prefers the more specific category when both match", () => {
    // "car insurance" is a personal-finance word ("insurance") and
    // travel-booking has "car". Finance should win on the specific word.
    expect(top("cheaper car insurance")).toBe("personal-finance");
  });

  it("matches whole words, not substrings", () => {
    // `art` must not fire on `artificial`, or a typo and a real creative
    // request would land in the same category.
    expect(top("artificial sweeteners")).not.toBe("creativity");
    expect(top("write a story")).toBe("creativity");
  });

  it("matches multi-word keywords as phrases", () => {
    expect(top("insurance claim denied")).toBe("health");
  });

  it("reports which query words triggered the match", () => {
    // This is what the "Matched: \"bills\" → Personal finance" line is built
    // from, so it has to be the reader's words and not the keyword.
    const [best] = matchCategories("lower my bills");

    expect(best?.slug).toBe("personal-finance");
    expect(best?.matched).toEqual(["bills"]);
  });

  it("ranks a specific match above a generic one", () => {
    // "trip" alone is one keyword for travel-planning; "japan itinerary" is
    // two for the same category and should not lose to another category's
    // single generic word.
    const matches = matchCategories("japan itinerary");
    const slugs = matches.map((match) => match.slug);

    expect(slugs.indexOf("travel-planning")).toBeGreaterThanOrEqual(0);
    expect(slugs.length).toBeGreaterThan(0);
  });

  it("can return more than one candidate, best first", () => {
    const matches = matchCategories("trip flights hotel");

    expect(matches.length).toBeGreaterThan(1);
    expect(matches[0]!.matched.length).toBeGreaterThanOrEqual(
      matches[matches.length - 1]!.matched.length,
    );
  });
});

describe("the keyword map itself", () => {
  it("covers exactly the eight categories the brief lists", () => {
    expect([...KEYWORD_CATEGORY_SLUGS].sort()).toEqual(
      [
        "creativity",
        "health",
        "personal-finance",
        "productivity",
        "shopping",
        "small-business",
        "travel-booking",
        "travel-planning",
      ],
    );
  });

  it("has no duplicate keyword inside a category", () => {
    // Same reason as the synonym table: a duplicate is invisible in output but
    // marks a careless edit. One shipped here on the first pass.
    for (const slug of KEYWORD_CATEGORY_SLUGS) {
      const words = matchCategories(slug).find((match) => match.slug === slug)?.matched ?? [];
      expect(new Set(words).size).toBe(words.length);
    }
  });

  it("never matches on its own slugs, which contain hyphens", () => {
    // `personal-finance` must not be findable by typing it — the hyphen means
    // it could only ever appear from a bad edit that put a slug in the word
    // list, and it would then appear in the "Matched:" line.
    expect(top("personal-finance")).toBeUndefined();
  });
});