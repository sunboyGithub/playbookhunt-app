import { describe, expect, it } from "vitest";

import { buildSearchTerms, extractPhrases, tokenize } from "@/lib/search/query";

describe("tokenize", () => {
  it("lowercases and splits on anything that is not a word character", () => {
    // No stopwords in this input on purpose: dropping them is tokenize's other
    // job, tested below, and mixing the two here made this case assert both.
    expect(tokenize("Lower Internet Bill!")).toEqual(["lower", "internet", "bill"]);
  });

  it("keeps digits, because model names and prices contain them", () => {
    expect(tokenize("GPT 4o cheaper")).toEqual(["gpt", "4o", "cheaper"]);
  });

  it("drops stopwords", () => {
    expect(tokenize("how do i save on my bills")).toEqual(["save", "bills"]);
  });

  it("returns nothing for a query of only stopwords", () => {
    expect(tokenize("what is it")).toEqual([]);
  });

  it("returns nothing for punctuation", () => {
    expect(tokenize("!!! ??? ---")).toEqual([]);
  });
});

describe("extractPhrases", () => {
  it("pulls quoted runs out of the query", () => {
    expect(extractPhrases('a "plan a trip" here')).toEqual(["plan a trip"]);
  });

  it("ignores an unclosed quote rather than swallowing the rest", () => {
    // An unbalanced quote from a phone keyboard should not turn every
    // subsequent word into part of a phrase.
    expect(extractPhrases('trip "japan')).toEqual([]);
  });

  it("handles several phrases", () => {
    expect(extractPhrases('"cheaper car insurance" or "japan itinerary"')).toEqual([
      "cheaper car insurance",
      "japan itinerary",
    ]);
  });
});

describe("buildSearchTerms", () => {
  it("marks an empty query empty", () => {
    const terms = buildSearchTerms("   ");

    expect(terms.isEmpty).toBe(true);
    expect(terms.text).toBe("");
    expect(terms.synonyms).toBe("");
  });

  it("marks a stopword-only query empty", () => {
    expect(buildSearchTerms("what is the").isEmpty).toBe(true);
  });

  it("keeps the reader's words in the AND clause, unexpanded", () => {
    // `text` is what Postgres ANDs. Synonyms must never enter it, or a search
    // for "bills" would stop requiring the word the reader actually typed.
    const terms = buildSearchTerms("lower my bills");

    expect(terms.text).toBe("lower bills");
    expect(terms.text).not.toContain("statement");
  });

  it("puts synonyms in a separate OR clause", () => {
    const terms = buildSearchTerms("bills");

    expect(terms.synonyms).toContain("statement");
    expect(terms.synonyms.split(" | ")).not.toContain("bills");
  });

  it("produces an empty synonym clause when nothing expands", () => {
    expect(buildSearchTerms("insurence").synonyms).toBe("");
  });

  it("keeps a quoted phrase out of the synonym clause", () => {
    // Someone quoting a title wants that title. Expanding its words would
    // return everything adjacent to it.
    const terms = buildSearchTerms('"lower your internet bill"');

    expect(terms.phrases).toEqual(["lower your internet bill"]);
    expect(terms.tokens).toEqual([]);
    expect(terms.synonyms).toBe("");
    expect(terms.text).toBe('"lower your internet bill"');
  });

  it("handles a quoted phrase alongside loose words", () => {
    const terms = buildSearchTerms('"japan itinerary" cheap flights');

    expect(terms.text).toBe('"japan itinerary" cheap flights');
    expect(terms.synonyms).toContain("airfare");
    expect(terms.isEmpty).toBe(false);
  });

  it("gives the acceptance-criteria queries a usable text clause", () => {
    // These are the queries P5 is graded on. Each must reach the database with
    // the word the reader typed still present.
    for (const query of [
      "comcast",
      "japan itinerary",
      "insurence",
      "lower my bills",
      "save money",
    ]) {
      const terms = buildSearchTerms(query);
      expect(terms.isEmpty).toBe(false);
      expect(terms.text.length).toBeGreaterThan(0);
    }
  });
});