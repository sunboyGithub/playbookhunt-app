/**
 * Words readers type that mean the same thing as a word in the catalogue.
 *
 * This is a query-side convenience only. It widens what a search can find; it
 * never changes what a playbook claims, and it is not evidence of anything.
 *
 * Groups are hand-written rather than learned, because a synonym list nobody can
 * audit is a synonym list nobody can correct. Three rules kept it small:
 *
 * 1. **Only one direction matters.** Every member expands to every other member,
 *    so `comcast` finds `internet` and `internet` finds `comcast`. Adding a
 *    one-way arrow would need a second data structure and buy nothing.
 * 2. **No chains.** Expansion is a single pass over the reader's own tokens. If
 *    `save` and `discount` were in one group and `discount` and `voucher` in
 *    another, only the first hop applies. Chaining turns a five-word group into
 *    a query that matches everything, and a search that matches everything ranks
 *    worse than one that matches the right things.
 * 3. **A word in two groups unions them.** `flight` being both a travel-booking
 *    and a travel-planning word is a fact about the word, not a bug to encode
 *    around.
 */

/**
 * Each group is a set of interchangeable words, most colloquial first. Order
 * inside a group is only for readability — lookup is by membership, not index.
 */
export const SYNONYM_GROUPS: readonly (readonly string[])[] = [
  // Money. The largest group, because "cut my X" and "lower my X" and "how do I
  // save on X" are three phrasings of the same request.
  ["bill", "bills", "billing", "statement", "invoice"],
  [
    "save",
    "saving",
    "savings",
    "cheap",
    "cheaper",
    "cheapest",
    "discount",
    "discounts",
    "reduce",
    "reducing",
    "cut",
    "cutting",
    "lower",
    "lowering",
  ],
  ["money", "cash", "budget", "spending", "cost", "costs"],
  ["refund", "reimburse", "reimbursement", "chargeback"],
  ["subscription", "subscriptions", "membership"],

  // Bills by provider. A reader types the name on the bill, not the category.
  ["internet", "comcast", "xfinity", "verizon", "att", "wifi", "broadband", "isp"],
  ["phone", "mobile", "cellphone", "cell", "landline"],

  // Travel.
  ["trip", "trips", "itinerary", "travel", "traveling", "travelling", "vacation", "holiday"],
  ["flight", "flights", "airline", "airlines", "plane", "airfare"],
  ["hotel", "hotels", "accommodation", "lodging", "stay", "airbnb"],
  ["japan", "japanese", "tokyo", "kyoto", "osaka"],

  // Vehicles.
  ["car", "cars", "auto", "vehicle", "vehicles", "insurance"],

  // Health. Kept separate from the vehicles group above: car insurance and
  // health insurance are different purchases, and merging them would let
  // "cheaper car insurance" surface medical playbooks.
  ["doctor", "physician", "gp", "clinic"],
  ["lab", "labs", "bloodwork", "panel", "test", "tests", "results"],
  ["dental", "dentist", "teeth", "orthodontic"],
  ["vision", "glasses", "contacts", "eye", "optometry"],
  ["medication", "medicine", "prescription", "rx", "pharmacy"],

  // Work and making things.
  ["invoice", "invoices", "billing"],
  ["client", "clients", "customer", "customers"],
  ["resume", "cv", "cover letter", "job", "jobs", "hiring", "interview"],
  ["write", "writing", "draft", "drafting", "copywriting"],
  ["image", "images", "photo", "photos", "picture", "art"],
  ["video", "videos", "clip", "reel", "reels"],
  ["email", "emails", "inbox", "messages", "reply"],

  // Getting something done.
  ["organize", "organise", "organizing", "tidy", "declutter", "clean"],
  ["plan", "planning", "schedule", "scheduling", "calendar"],
  ["meeting", "meetings", "call", "calls", "standup"],
  ["note", "notes", "notebook"],
  ["task", "tasks", "todo", "todos", "to-do", "checklist"],
];

/**
 * word → the set of groups it appears in. Built once at module load.
 *
 * A word in two groups is the normal case rather than an accident, so the value
 * is a list and expansion unions every group the word belongs to.
 */
const GROUPS_BY_WORD = new Map<string, string[][]>();

for (const group of SYNONYM_GROUPS) {
  for (const word of group) {
    const existing = GROUPS_BY_WORD.get(word);
    if (existing) {
      existing.push([...group]);
    } else {
      GROUPS_BY_WORD.set(word, [[...group]]);
    }
  }
}

/**
 * Every other word that means the same as `token`, or an empty array if it has
 * no synonyms.
 *
 * The token itself is excluded: `bills` expanding to `bills | bill | statement`
 * adds nothing to a query that already contains `bills`, and dropping it keeps
 * the generated clause shorter.
 */
export function synonymsFor(token: string): string[] {
  const groups = GROUPS_BY_WORD.get(token);
  if (!groups) {
    return [];
  }

  const merged = new Set<string>();
  for (const group of groups) {
    for (const word of group) {
      if (word !== token) {
        merged.add(word);
      }
    }
  }

  return [...merged];
}

/**
 * The reader's tokens plus their synonyms, deduplicated, first-seen order.
 *
 * Order is preserved rather than sorted because it is the order the reader
 * typed, and Postgres weights earlier tsquery terms slightly higher. It is a
 * small effect, but there is no reason to discard information.
 */
export function expandTokens(tokens: readonly string[]): string[] {
  const seen = new Set<string>();
  const expanded: string[] = [];

  for (const token of tokens) {
    if (seen.has(token)) {
      continue;
    }
    seen.add(token);
    expanded.push(token);

    for (const synonym of synonymsFor(token)) {
      if (!seen.has(synonym)) {
        seen.add(synonym);
        expanded.push(synonym);
      }
    }
  }

  return expanded;
}

/** Every word in the table, sorted. For tests and for auditing. */
export const SYNONYM_WORDS: readonly string[] = [...GROUPS_BY_WORD.keys()].sort();
