/**
 * Prompt template rendering.
 *
 * Entirely client-side, and that is a requirement rather than an implementation
 * choice: AGENTS.md forbids sending a reader's inputs to our server, so the
 * filled prompt is assembled in the browser and never leaves it. Nothing in this
 * file may be imported by a server component that could run during SSR with real
 * values — it takes values as an argument and is called from the client only.
 *
 * A playbook's `prompt_template` carries `{{key}}` placeholders, one per input.
 * This turns those into values, and turns the ones with no value into `[Label]`
 * so a reader can see exactly what the prompt is missing.
 */

export type TemplateInput = {
  key: string;
  label: string;
};

/** What the caller needs to render the prompt *and* highlight what is missing. */
export type TemplateResult = {
  /** The prompt, ready to copy. Never contains an unsubstituted `{{…}}`. */
  text: string;
  /**
   * Keys the template referenced that had no usable value, in first-appearance
   * order and deduplicated.
   *
   * Returned rather than only shown as `[Label]` so the panel can highlight the
   * exact placeholders in the rendered text, and so "which fields are still
   * missing" is a question with an answer instead of a string search.
   */
  unfilled: string[];
};

/**
 * `{{key}}` with optional inner whitespace, so `{{ price }}` resolves the same
 * way `{{price}}` does. A template author writing YAML by hand should not have
 * to remember which of the two forms the parser accepts.
 */
const TOKEN = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

/**
 * Render a prompt template.
 *
 * Values are inserted verbatim — a prompt is text for an LLM, not markup, so
 * quotes, braces and newlines in an input must survive intact. A value that
 * itself contains `{{…}}` is *not* re-substituted, because the substitution is a
 * single pass: without that, a bill pasted in as `{{price}}` would be replaced by
 * a later key's value.
 */
export function renderTemplate(
  template: string,
  inputs: readonly TemplateInput[],
  values: Readonly<Record<string, string | undefined>>,
): TemplateResult {
  const labels = new Map(inputs.map((input) => [input.key, input.label] as const));
  const unfilled: string[] = [];
  const seen = new Set<string>();

  const text = template.replace(TOKEN, (_match, rawKey: string) => {
    const value = values[rawKey]?.trim();

    if (value) {
      return value;
    }

    if (!seen.has(rawKey)) {
      seen.add(rawKey);
      unfilled.push(rawKey);
    }

    // A key with no matching input has no label to show. The raw key is the
    // honest thing to display — it names what is missing, where `[undefined]`
    // would name nothing.
    return `[${labels.get(rawKey) ?? rawKey}]`;
  });

  return { text, unfilled };
}

/**
 * Every key a template references, in first-appearance order.
 *
 * Used to warn at authoring time about a `{{key}}` with no matching input, which
 * otherwise renders as `[key]` to a reader with no way to fill it.
 */
export function templateKeys(template: string): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();

  for (const match of template.matchAll(TOKEN)) {
    const key = match[1];
    if (key && !seen.has(key)) {
      seen.add(key);
      keys.push(key);
    }
  }

  return keys;
}