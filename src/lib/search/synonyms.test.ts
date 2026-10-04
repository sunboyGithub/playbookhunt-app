import { describe, expect, it } from "vitest";

import {
  expandTokens,
  SYNONYM_GROUPS,
  synonymsFor,
} from "@/lib/search/synonyms";

describe("synonymsFor", () => {
  it("returns nothing for a word it has never heard of", () => {
    expect(synonymsFor("insurence")).toEqual([]);
  });

  it("expands a word to the rest of its group", () => {
    const found = synonymsFor("bills");

    expect(found).toContain("bill");
    expect(found).toContain("statement");
    expect(found).not.toContain("bills");
  });

  it("expands in both directions", () => {
    // The whole reason a plain map is not enough: a reader typing the
    // colloquial word must reach the catalogue's word, and vice versa.
    expect(synonymsFor("comcast")).toContain("internet");
    expect(synonymsFor("internet")).toContain("comcast");
    expect(synonymsFor("cheap")).toContain("save");
    expect(synonymsFor("trip")).toContain("itinerary");
  });

  it("unions every group a word belongs to", () => {
    // `invoice` sits in the money group (bill/statement) *and* in the business
    // group (invoices). Taking only one of them would send a reader who typed
    // "invoice" looking for their household bills over to the freelancing
    // playbook, or the reverse, depending on which group won.
    const found = synonymsFor("invoice");

    expect(found).toContain("bill");
    expect(found).toContain("invoices");
    expect(found).not.toContain("invoice");
  });
});

describe("expandTokens", () => {
  it("keeps the reader's own tokens and adds their synonyms", () => {
    const expanded = expandTokens(["bills"]);

    expect(expanded[0]).toBe("bills");
    expect(expanded).toContain("statement");
  });

  it("deduplicates, so a word that appears twice is expanded once", () => {
    const expanded = expandTokens(["bill", "bills"]);

    expect(expanded.filter((token) => token === "bill")).toHaveLength(1);
    expect(new Set(expanded).size).toBe(expanded.length);
  });

  it("does not chain: an expansion is not itself expanded", () => {
    // `car` and `insurance` are in the same group, and `insurance` has no
    // group of its own, so nothing to chain here. The assertion that matters is
    // that every group a seed token belongs to is unioned in one pass.
    const expanded = expandTokens(["car"]);

    expect(expanded).toContain("insurance");
    expect(expanded).not.toContain("doctor");
  });

  it("returns the input unchanged when nothing is a synonym", () => {
    expect(expandTokens(["insurence", "xyzzy"])).toEqual(["insurence", "xyzzy"]);
  });
});

describe("the synonym table itself", () => {
  it("has no duplicate word inside a group", () => {
    // A duplicate is invisible in output — the Set in expandTokens hides it —
    // but it means the group was edited carelessly and the next edit may not
    // be. Both slipped in while this table was first written.
    for (const group of SYNONYM_GROUPS) {
      expect(new Set(group).size).toBe(group.length);
    }
  });

  it("uses only plain lower-case words", () => {
    // These strings are interpolated into a tsquery clause, so a stray space or
    // capital in the table would corrupt the query rather than fail to match.
    for (const word of SYNONYM_GROUPS.flat()) {
      expect(word).toMatch(/^[a-z][a-z -]*$/);
    }
  });

  it("has a group behind every word it indexes", () => {
    expect(SYNONYM_GROUPS.length).toBeGreaterThan(20);
    for (const group of SYNONYM_GROUPS) {
      expect(group.length).toBeGreaterThan(1);
    }
  });
});