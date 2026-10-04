/**
 * Words that mean "this person is asking for a playbook in this category".
 *
 * This is the floor under search. Text matching finds what is written down; this
 * finds what was meant. Someone typing "lower my bills" is asking a personal
 * finance question even if no title contains the phrase "lower my bills", and a
 * search that returns nothing for that is a dead end — which the brief forbids
 * outright: "Search must never dead-end."
 *
 * When a text search comes back thin, the categories matched here supply the
 * rest of the results and the page says so, in the reader's own words:
 *
 *   Matched: "bills" → Personal finance
 *
 * That line is the reason this map is auditable rather than clever. A reader
 * can see exactly why they were shown what they were shown, and can correct it
 * by picking a different category from the filter sidebar.
 *
 * Keywords are matched as whole words against the query, so "art" does not fire
 * on "artificial". Multi-word entries are matched as whole phrases.
 */

type CategoryKeywords = {
  slug: string;
  /** Display name is resolved from the database by the caller, not stored here. */
  words: readonly string[];
};

/**
 * Declaration order is tie-break order: when two categories match equally well,
 * the one listed first wins. That order is the order the brief lists the
 * categories in, so it is at least predictable.
 */
const CATEGORY_KEYWORDS: readonly CategoryKeywords[] = [
  {
    slug: "personal-finance",
    words: [
      "bill", "bills", "billing", "internet", "phone", "insurance", "save",
      "saving", "savings", "cheap", "cheaper", "budget", "mortgage", "rent",
      "subscription", "subscriptions", "bank", "banking", "tax", "taxes",
      "refund", "credit", "card", "cards", "loan", "debt", "money", "cash",
      "coupon", "coupons", "price", "prices", "cost", "costs", "fee", "fees",
      "cheapest", "discount", "grocery", "groceries", "utility", "utilities",
      // The names that actually appear on the bill. Someone renegotiating their
      // bill thinks in providers, not in the word "internet", and without these
      // the category fallback has nothing to match on.
      "comcast", "xfinity", "verizon", "att", "spectrum", "cox", "tmobile",
      "wifi", "broadband", "isp", "mobile", "landline",
    ],
  },
  {
    slug: "travel-booking",
    words: [
      "flight", "flights", "airfare", "airline", "airlines", "hotel",
      "hotels", "booking", "book", "accommodation", "lodging", "stay", "trip",
      "trips", "ticket", "tickets", "cruise", "rental", "car", "rental car",
    ],
  },
  {
    slug: "travel-planning",
    words: [
      "trip", "trips", "itinerary", "japan", "travel", "vacation", "holiday",
      "guide", "plan", "planning", "schedule", "packing", "route", "roadmap",
      "visit", "tour",
    ],
  },
  {
    slug: "shopping",
    words: [
      "buy", "buying", "purchase", "shop", "shopping", "product", "products",
      "deal", "deals", "gift", "gifts", "compare", "best", "review", "reviews",
      "order", "return", "returns", "exchange", "size", "outlet",
    ],
  },
  {
    slug: "small-business",
    words: [
      "invoice", "invoices", "client", "clients", "customer", "customers",
      "business", "freelance", "contract", "contracts", "employee", "employees",
      "hiring", "onboarding", "marketing", "sales", "quote", "proposal",
      "sole", "trader", "llc", "receipt", "accounting", "payroll", "hr",
    ],
  },
  {
    slug: "productivity",
    words: [
      "organize", "organise", "organizing", "calendar", "email", "emails",
      "inbox", "meeting", "meetings", "notes", "note", "task", "tasks", "todo",
      "todos", "checklist", "schedule", "scheduling", "focus", "habit",
      "habits", "routine", "workflow", "planning", "time management",
    ],
  },
  {
    slug: "health",
    words: [
      "doctor", "lab", "labs", "symptom", "symptoms", "medication",
      "medicine", "prescription", "pharmacy", "dental", "dentist", "vision",
      "glasses", "contacts", "appointment", "clinic", "medical", "health",
      "insurance claim", "claim", "claims", "reimbursement", "referral",
      "diagnosis", "test", "tests", "results", "bloodwork", "therapy",
    ],
  },
  {
    slug: "creativity",
    words: [
      "write", "writing", "draft", "drafting", "image", "images", "photo",
      "photos", "picture", "design", "edit", "editing", "video", "videos",
      "story", "copy", "copywriting", "art", "illustration", "thumbnail",
      "caption", "headshot", "logo", "resume", "cv", "cover letter",
    ],
  },
];

export type CategoryMatch = {
  slug: string;
  /** The query words that triggered this match, in query order. */
  matched: string[];
};

/**
 * Quote a keyword for a regex: only characters that could otherwise mean
 * something in a pattern get escaped. Keywords are literal English words and
 * slugs, so escaping everything would just make them unreadable.
 */
function escapeForRegex(word: string): string {
  return word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Categories a query looks like it is asking about, best first.
 *
 * Scoring is by *distinct matched keywords*, weighted by specificity. Weighting
 * matters because otherwise a query containing one generic word can outscore a
 * query containing two specific ones: "trip" appearing once for travel-planning
 * would tie "japan itinerary" matching two words, and the generic word would
 * win on declaration order. Weighting by matched-word length makes the specific
 * match win, which is the intent.
 *
 * Returns every category that matched, not just the top one, so the caller can
 * offer more than one fallback. Empty when nothing matched — the caller then
 * shows popular playbooks and the request form, which is the last of the three
 * never-dead-end layers.
 */
export function matchCategories(query: string): CategoryMatch[] {
  const normalized = query.toLowerCase().trim();
  if (normalized.length === 0) {
    return [];
  }

  const scored: { match: CategoryMatch; score: number }[] = [];

  for (const { slug, words } of CATEGORY_KEYWORDS) {
    const matched: string[] = [];
    let score = 0;

    for (const word of words) {
      // A space-separated keyword is a phrase and is matched as one; a
      // single word is matched on word boundaries. `\b` is not enough for
      // phrases with a space in them, so the space is matched explicitly.
      const pattern = word.includes(" ")
        ? new RegExp(`\\b${escapeForRegex(word).replace(/ /g, "\\s+")}\\b`)
        : new RegExp(`\\b${escapeForRegex(word)}\\b`);

      if (pattern.test(normalized)) {
        matched.push(word);
        // Longest match is the most specific, so weight by length. Two matched
        // keywords are worth more than one: someone who typed two words from
        // this list is more likely to want this category than someone who typed
        // one word that happens to be listed twice.
        score += word.length + 1;
      }
    }

    if (matched.length > 0) {
      scored.push({ match: { slug, matched }, score });
    }
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.match);
}

/** Every category slug this map knows about, for tests and for coverage checks. */
export const KEYWORD_CATEGORY_SLUGS: readonly string[] = CATEGORY_KEYWORDS.map(
  (entry) => entry.slug,
);