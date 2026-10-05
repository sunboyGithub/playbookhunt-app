/**
 * Placeholder references in a prompt template.
 *
 * ## Why this is checked at all
 *
 * A prompt is a template with `{{key}}` holes in it, and the Try flow fills them
 * with whatever the reader typed. A hole naming an input that does not exist is
 * not a cosmetic bug: the reader gets a literal `{{internet_prov}}` pasted into
 * their agent, which is the single most confusing thing this product can hand
 * somebody. Nothing else in the system would catch it — the placeholder is
 * substituted as plain text, and a key with no matching input simply matches
 * nothing.
 *
 * So both directions are reported: holes with no input, and inputs with no hole.
 * Which of the two is fatal depends on who is editing, so this module reports and
 * lets the caller decide — see {@link PromptReferenceReport}.
 */

/** `{{ key }}`, tolerating spaces inside the braces. Nothing else is a hole. */
const PLACEHOLDER = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

/** The input keys used in a prompt, in order of first appearance, deduplicated. */
export function referencedKeys(prompt: string): string[] {
  const seen = new Set<string>();

  for (const match of prompt.matchAll(PLACEHOLDER)) {
    seen.add(match[1]!);
  }

  return [...seen];
}

export type PromptReferenceReport = {
  /** Keys the prompt uses that no input defines. These are the fatal ones. */
  unknown: string[];
  /** Inputs nobody uses in the prompt. Reported, not refused. */
  unused: string[];
};

/**
 * Compare a prompt against the inputs it is supposed to use.
 *
 * `unused` is a warning rather than an error for a reason worth stating: an
 * optional input is often used by an *instruction*, not by the prompt — "paste
 * your renewal summary" tells the reader what to type into a field the prompt
 * never mentions. Refusing that would push an author to write a prompt that
 * mentions everything, which is worse prose than the alternative.
 */
export function checkPromptReferences(
  prompt: string,
  inputKeys: readonly string[],
): PromptReferenceReport {
  const known = new Set(inputKeys);
  const used = referencedKeys(prompt);

  return {
    unknown: used.filter((key) => !known.has(key)),
    unused: inputKeys.filter((key) => !used.includes(key)),
  };
}

/**
 * The sentence shown for a missing reference.
 *
 * Names the inputs that are missing and the ones that exist, because "invalid
 * placeholder" tells somebody nothing they can act on — the fix is either to
 * delete a hole or to add an input, and only they can say which.
 */
export function describeMissingReferences(
  report: PromptReferenceReport,
  labels: ReadonlyMap<string, string>,
): string {
  const name = (key: string) => labels.get(key) ?? key;

  const parts: string[] = [];

  if (report.unknown.length > 0) {
    parts.push(
      `The prompt uses ${report.unknown.map((key) => `"{{${name(key)}}}"`).join(", ")}, which ${report.unknown.length === 1 ? "is not a user input" : "are not user inputs"}.`,
    );
  }

  if (report.unused.length > 0) {
    parts.push(
      `Nothing in the prompt uses ${report.unused.map((key) => name(key)).join(", ")}.`,
    );
  }

  return parts.join(" ");
}