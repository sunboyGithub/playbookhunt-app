/**
 * The try form's field types, and the mapping from stored input rows to them.
 *
 * Deliberately *not* a `"use client"` module, and that is the reason it exists
 * separately from `fields.tsx`. The playbook detail page builds the try panel's
 * props on the server — it already has the version's inputs, and passing them
 * straight through avoids a second query — and a server component cannot call a
 * function exported from a client module. So the pure half lives here, where both
 * sides can import it, and `fields.tsx` keeps only the JSX.
 *
 * Nothing in this file sends anything anywhere. Values are read in the browser
 * by the template renderer; there is no fetch, no server action and no analytics
 * call on this path. That is the privacy requirement in AGENTS.md, and it holds
 * by there being no code here that could transmit a value.
 */

export type FieldType =
  | "text"
  | "textarea"
  | "select"
  | "number"
  | "money"
  | "zip"
  | "provider_picker"
  | "date";

const FIELD_TYPES: readonly FieldType[] = [
  "text",
  "textarea",
  "select",
  "number",
  "money",
  "zip",
  "provider_picker",
  "date",
];

/** Only what the form renders; the query selects a subset of the row. */
export type TryField = {
  id: string;
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  options: string[] | null;
  placeholder: string | null;
  why_it_helps: string | null;
};

/** The row shape as the generated types describe it — wider and looser. */
type RawInput = {
  id: string;
  key: string;
  label: string;
  help: string | null;
  why_it_helps: string | null;
  type: string;
  options: unknown;
  required: boolean;
};

/**
 * Narrow a stored input row to what the form can render.
 *
 * Two things need narrowing rather than casting, and the difference matters:
 *
 * - `type` is `text` with a check constraint, so the generated type is `string`
 *   and only the database enforces the list. An unknown value falls back to
 *   `text`, which renders a usable input, instead of throwing and taking the
 *   whole try flow down over one field.
 * - `options` is `jsonb`, so it arrives as `unknown`. Only an array whose
 *   entries are strings counts; anything else is treated as "no options", which
 *   renders an explanation rather than a control that cannot be used.
 */
export function toTryFields(inputs: readonly RawInput[]): TryField[] {
  return inputs.map((input) => ({
    id: input.id,
    key: input.key,
    label: input.label,
    type: (FIELD_TYPES as readonly string[]).includes(input.type)
      ? (input.type as FieldType)
      : "text",
    required: input.required,
    options: Array.isArray(input.options)
      ? input.options.filter((option): option is string => typeof option === "string")
      : null,
    placeholder: null,
    // `why_it_helps` is the newer, more specific column; `help` is the older
    // general one. Preferring the former keeps the optional line saying why a
    // field helps rather than restating the label.
    why_it_helps: input.why_it_helps ?? input.help,
  }));
}

/**
 * Which required fields are still blank.
 *
 * Returns keys rather than a boolean so the prompt panel can name them and the
 * reader can go straight to the one that stopped them.
 */
export function missingRequired(fields: readonly TryField[], values: Readonly<Record<string, string>>): string[] {
  return fields.filter((field) => field.required && !values[field.key]?.trim()).map((field) => field.key);
}
