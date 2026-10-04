import { expandTokens } from "@/lib/search/synonyms";

/**
 * Turns what someone typed into the two strings the Postgres search function
 * takes.
 *
 * Everything here is pure and lives outside `server-only` so it can be unit
 * tested directly; the SQL is a thin wrapper that passes these two strings
 * through. Keeping tokenisation and expansion out of the server module is what
 * makes "does 'lower my bills' reach the database in a form that can match
 * anything" a question a test can answer rather than a question about SQL.
 */

/**
 * Words Postgres's `english` stemmer already drops. Removed here too, for a
 * reason that has nothing to do with Postgres: a stopword in the input would
 * survive into the synonym clause as an OR branch, so a query for "how do I
 * save on my bills" would expand `do` and `i` and `my` into a clause that ORs
 * them back in — where every single word in the catalogue matches them.
 */
const STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "but", "by", "can", "do", "does",
  "for", "from", "get", "how", "i", "if", "in", "is", "it", "my", "of", "on",
  "or", "so", "that", "the", "to", "was", "what", "when", "with", "you", "your",
]);

/**
 * A phrase typed inside double quotes is used exactly as written, with no
 * stemming and no expansion. `websearch_to_tsquery` treats a quoted run as a
 * phrase; keeping it verbatim here is what lets someone search for a title they
 * half-remember. Stripped of the quotes before it is passed on.
 */
export type SearchTerms = {
  /** The reader's own words, lowercased, stopwords removed, in typed order. */
  tokens: string[];
  /** The quoted phrases they asked for verbatim. Never expanded. */
  phrases: string[];
  /**
   * Pass to the function's `q`. Phrases are interpolated with quotes so
   * Postgres keeps them as phrases; everything else is joined by spaces, which
   * `websearch_to_tsquery` reads as AND.
   */
  text: string;
  /**
   * Pass to the function's `syn`. A `|`-joined OR of every synonym for every
   * token. Empty when there is nothing to add, which the function treats as
   * "no synonym branch".
   */
  synonyms: string;
  /** True when there is at least one token or phrase worth querying. */
  isEmpty: boolean;
};

export function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 0 && !STOPWORDS.has(token));
}

export function extractPhrases(query: string): string[] {
  const phrases: string[] = [];
  const pattern = /"([^"]+)"/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(query)) !== null) {
    const phrase = match[1]!.trim().toLowerCase();
    if (phrase.length > 0) {
      phrases.push(phrase);
    }
  }

  return phrases;
}

/**
 * Build the two strings the search function needs.
 *
 * The split between `text` and `synonyms` is the whole design. `text` is ANDed:
 * every word the reader typed must appear. `synonyms` is ORed in *alongside* it,
 * never instead of it, so a synonym can widen the search but cannot let a
 * playbook match on a word the reader never typed while dropping one they did.
 */
export function buildSearchTerms(query: string): SearchTerms {
  const phrases = extractPhrases(query);
  const phrasesConsumed = query.replace(/"([^"]+)"/g, " ");
  const tokens = tokenize(phrasesConsumed);

  const text = [
    ...phrases.map((phrase) => `"${phrase}"`),
    ...tokens,
  ].join(" ");

  const expanded = expandTokens(tokens);
  const originals = new Set(tokens);
  const extra = expanded.filter((token) => !originals.has(token));

  return {
    tokens,
    phrases,
    text,
    synonyms: extra.join(" | "),
    isEmpty: tokens.length === 0 && phrases.length === 0,
  };
}