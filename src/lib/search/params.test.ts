import { describe, expect, it } from "vitest";

import {
  activeFilterCount,
  buildResultsHref,
  parseResultsParams,
  toListFilters,
  toQueryString,
} from "@/lib/search/params";

const BASE = parseResultsParams({});

describe("parseResultsParams", () => {
  it("returns the defaults for an empty URL", () => {
    expect(BASE).toEqual({
      q: "",
      category: undefined,
      agent: undefined,
      outcome: undefined,
      verified: undefined,
      minReports: undefined,
      timeBand: undefined,
      sort: "best_evidence",
      view: "cards",
      page: 1,
    });
  });

  it("round-trips through toQueryString", () => {
    // The shareability requirement is only true if serialise and parse are
    // inverses, so this pins it on every field at once rather than field by field.
    const params = parseResultsParams({
      q: "lower my bills",
      category: "personal-finance",
      agent: "muse",
      outcome: "save_money",
      verified: "30",
      min_reports: "20",
      time: "under15",
      sort: "trending",
      view: "list",
      page: "3",
    });

    expect(parseResultsParams(Object.fromEntries(new URLSearchParams(toQueryString(params))))).toEqual(params);
  });

  it("ignores an unknown sort rather than throwing", () => {
    expect(parseResultsParams({ sort: "by_vibes" }).sort).toBe("best_evidence");
  });

  it("ignores an unknown outcome pill", () => {
    expect(parseResultsParams({ outcome: "vibes" }).outcome).toBeUndefined();
  });

  it("ignores an unknown time band", () => {
    expect(parseResultsParams({ time: "whenever" }).timeBand).toBeUndefined();
  });

  it("treats a min_reports of 0 as no filter", () => {
    // 0 is one of the offered steps but it filters nothing, so it must not
    // render as an active facet.
    expect(parseResultsParams({ min_reports: "0" }).minReports).toBeUndefined();
  });

  it("honours a min_reports of 20 or 100 and nothing else", () => {
    expect(parseResultsParams({ min_reports: "20" }).minReports).toBe(20);
    expect(parseResultsParams({ min_reports: "100" }).minReports).toBe(100);
    expect(parseResultsParams({ min_reports: "7" }).minReports).toBeUndefined();
  });

  it("rejects a verified window it does not offer", () => {
    expect(parseResultsParams({ verified: "30" }).verified).toBe(30);
    expect(parseResultsParams({ verified: "9999" }).verified).toBeUndefined();
  });

  it("clamps a nonsensical page rather than passing it through", () => {
    // A negative offset throws in Postgres; page 0 is off-by-one for a reader.
    expect(parseResultsParams({ page: "0" }).page).toBe(1);
    expect(parseResultsParams({ page: "-3" }).page).toBe(1);
    expect(parseResultsParams({ page: "abc" }).page).toBe(1);
    expect(parseResultsParams({ page: "4" }).page).toBe(4);
  });

  it("takes the first value of a repeated parameter", () => {
    expect(parseResultsParams({ category: ["a", "b"] }).category).toBe("a");
  });

  it("trims the query", () => {
    expect(parseResultsParams({ q: "  bills  " }).q).toBe("bills");
  });
});

describe("toListFilters", () => {
  it("maps save money and save time onto the outcome groups", () => {
    expect(toListFilters(parseResultsParams({ outcome: "save_money" })).outcomeGroup).toBe(
      "save_money",
    );
    expect(toListFilters(parseResultsParams({ outcome: "save_time" })).outcomeGroup).toBe(
      "save_time",
    );
  });

  it("maps the other pills onto categories", () => {
    const research = toListFilters(parseResultsParams({ outcome: "research" }));
    expect(research.categorySlugs).toEqual(["health"]);
  });

  it("lets a chosen category override the outcome pill", () => {
    // Both in the URL is a legitimate thing to share. The category is the more
    // specific statement, so it wins rather than the two fighting in the query.
    const filters = toListFilters(
      parseResultsParams({ category: "shopping", outcome: "save_money" }),
    );

    expect(filters.categorySlug).toBe("shopping");
    expect(filters.categorySlugs).toBeUndefined();
    expect(filters.outcomeGroup).toBeUndefined();
  });

  it("turns a time band into both bounds", () => {
    const band = toListFilters(parseResultsParams({ time: "from15to60" }));

    expect(band.minTimeMinutes).toBe(15);
    expect(band.maxTimeMinutes).toBe(60);
  });

  it("leaves an open-ended band unbounded on one side", () => {
    const over60 = toListFilters(parseResultsParams({ time: "over60" }));

    expect(over60.minTimeMinutes).toBe(61);
    expect(over60.maxTimeMinutes).toBeUndefined();
  });

  it("passes the remaining filters straight through", () => {
    const filters = toListFilters(
      parseResultsParams({ agent: "muse", verified: "30", min_reports: "20" }),
    );

    expect(filters.agentSlug).toBe("muse");
    expect(filters.verifiedWithinDays).toBe(30);
    expect(filters.minReports).toBe(20);
  });
});

describe("buildResultsHref", () => {
  it("keeps every other param when changing one", () => {
    const current = parseResultsParams({ q: "bills", category: "personal-finance", view: "list" });
    const href = buildResultsHref("/search", current, { outcome: "save_money" });

    expect(href).toContain("q=bills");
    expect(href).toContain("category=personal-finance");
    expect(href).toContain("view=list");
    expect(href).toContain("outcome=save_money");
  });

  it("clears a filter when passed null", () => {
    const current = parseResultsParams({ category: "shopping" });

    expect(buildResultsHref("/search", current, { category: null })).toBe("/search");
  });

  it("returns the bare path when nothing is set", () => {
    expect(buildResultsHref("/search", BASE, {})).toBe("/search");
  });

  it("resets to page 1 when the result set changes", () => {
    // The bug this prevents: a reader on page 7 adds a filter, lands on page 7
    // of a shorter list, and concludes the filter found nothing.
    const current = parseResultsParams({ q: "bills", page: "7" });

    expect(buildResultsHref("/search", current, { category: "shopping" })).not.toContain("page=");
  });

  it("does not reset the page when only the view changes", () => {
    // Switching cards to list does not change which playbooks are in the list,
    // so keeping the page is right rather than surprising.
    const current = parseResultsParams({ page: "3" });

    expect(buildResultsHref("/search", current, { view: "list" })).toContain("page=3");
  });

  it("keeps the path, so a category page filters its own results", () => {
    expect(buildResultsHref("/c/personal-finance", BASE, { outcome: "create" })).toContain(
      "/c/personal-finance?",
    );
  });
});

describe("activeFilterCount", () => {
  it("counts nothing for a default URL", () => {
    expect(activeFilterCount(BASE)).toBe(0);
  });

  it("counts each set facet, but not the query or the sort", () => {
    const params = parseResultsParams({
      q: "bills",
      sort: "trending",
      category: "personal-finance",
      outcome: "save_money",
      time: "under15",
    });

    // `q` and `sort` are not facets, and `view` is not either.
    expect(activeFilterCount(params)).toBe(3);
  });
});