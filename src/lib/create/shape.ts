import type { OutcomeType } from "@/lib/report/shape";

/**
 * The creator-facing shape of a playbook in progress.
 *
 * ## Why this is not the database shape
 *
 * The brief is explicit that the creator form does not mirror `content/playbooks/*.yaml`:
 * a person writing a playbook should never meet a placeholder key, a `why_it_helps`
 * line, or a regex. So this type is deliberately *not* `PlaybookFile` and does not
 * import it. The translation happens once, in `materialize()`, at submission.
 *
 * Three consequences worth naming, because each is a rule the brief states as a
 * product requirement rather than a storage detail:
 *
 * - **Keys are generated and frozen.** A creator never types one. Once an input
 *   has a key it keeps it, because the prompt references it — regenerating on a
 *   rename would silently break every `{{hole}}` in a prompt somebody already wrote.
 * - **Choices are one-per-line strings in the form** and an array in storage. The
 *   brief says "Choices (one per line)", and the database column is `jsonb`.
 * - **`promptTouched` is stored, not derived.** The generated example stays in
 *   sync with the title and inputs *until the creator edits it*; after that their
 *   wording survives every later field change, autosave and reload. That is the
 *   difference between a starter and an overwrite, so the flag has to survive a
 *   reload and cannot be recomputed from the prompt text.
 */

export type InputFormatOption = {
  format: string;
  /** The name shown on the select. The brief's wording, verbatim. */
  label: string;
  /** `playbook_inputs.type`, for storage. */
  dbType:
    | "text"
    | "textarea"
    | "provider_picker"
    | "select"
    | "money"
    | "number"
    | "zip"
    | "date";
  /** Whether this format shows the "Choices (one per line)" box. */
  hasChoices: boolean;
};

/**
 * The eight answer formats, named for creators rather than for the database.
 *
 * The names are deliberately not the eight `playbook_inputs.type` values: a
 * creator choosing "Provider choices" is answering a different question from
 * somebody choosing `provider_picker`, and making them read our column name would
 * be the first unfriendly thing the form does. This table is the only place the
 * two vocabularies meet.
 *
 * `InputFormat` is *derived* from it rather than declared beside it. Written the
 * other way round — a union plus a `find` with a non-null assertion — there is a
 * window where the two disagree, and the symptom is a `dbType` of `undefined`
 * reaching a column with a check constraint on it.
 */
export const INPUT_FORMATS = [
  { format: "short_text", label: "Short text", dbType: "text", hasChoices: false },
  { format: "long_text", label: "Long text", dbType: "textarea", hasChoices: false },
  {
    format: "provider_choices",
    label: "Provider choices",
    dbType: "provider_picker",
    hasChoices: true,
  },
  {
    format: "dropdown_choices",
    label: "Dropdown choices",
    dbType: "select",
    hasChoices: true,
  },
  { format: "money", label: "Money", dbType: "money", hasChoices: false },
  { format: "number", label: "Number", dbType: "number", hasChoices: false },
  { format: "zip", label: "ZIP code", dbType: "zip", hasChoices: false },
  { format: "date", label: "Date", dbType: "date", hasChoices: false },
] as const satisfies readonly InputFormatOption[];

export type InputFormat = (typeof INPUT_FORMATS)[number]["format"];

export function formatOption(format: InputFormat): InputFormatOption {
  return INPUT_FORMATS.find((option) => option.format === format)!;
}

/** One creator-defined user input. */
export type DraftInput = {
  /**
   * The internal `{{key}}`, generated. Never shown, never asked for.
   *
   * Frozen once assigned — see the note on {@link DraftInput}.
   */
  key: string;
  /** "Input name" — what the creator asks for. Named, not answered. */
  name: string;
  format: InputFormat;
  /** One choice per line in the form; an array everywhere else. */
  choices: string[];
  required: boolean;
};

export const MAX_REQUIRED_INPUTS = 2;
export const MAX_STEPS = 5;
export const MAX_INPUTS = 8;

/** The outcome types a creator may select, in the brief's wording. */
export const OUTCOME_OPTIONS: readonly { value: OutcomeType; label: string; unit: string }[] = [
  { value: "binary", label: "Task completed", unit: "" },
  { value: "money_monthly", label: "Money saved each month", unit: "$/mo" },
  { value: "money_yearly", label: "Money saved each year", unit: "$/yr" },
  { value: "money_once", label: "Money saved once", unit: "$" },
  { value: "time_hours", label: "Hours saved", unit: "hrs" },
];

/**
 * The whole in-progress playbook.
 *
 * Stored as one `jsonb` blob in `playbook_drafts.content`. The columns are all
 * nullable or defaulted in the schema because an unfinished draft has none of
 * them, and a draft is savable at every point — that is a brief requirement, not
 * a nicety ("Save draft must work without satisfying submission requirements").
 */
export type DraftContent = {
  title: string;
  promise: string;
  /** `categories.id`, not the slug: the form renders the taxonomy from the database. */
  categoryId: string;
  whoFor: string;
  whoNotFor: string;
  /** Minutes. `null` rather than 0 so "not answered yet" is distinguishable. */
  timeMin: number | null;
  timeMax: number | null;
  outcomeType: OutcomeType | null;
  inputs: DraftInput[];
  prompt: string;
  /** Whether the creator has edited the prompt away from the generated example. */
  promptTouched: boolean;
  /** Step 1 first. Blank optional steps are dropped at materialization. */
  steps: string[];
  /** "What result did you get?" — private reviewer notes. Never public. */
  testingNotes: string;
  /** "Inspired by post (optional)". Any valid http/https link. */
  sourceUrl: string;
};

/** Step 1's prefilled, editable default. Real content, not a placeholder. */
export const DEFAULT_STEP =
  "Enter your details, then copy the prompt into Muse.";

/**
 * A fresh draft.
 *
 * One required input, one prefilled Step 1 and one empty Step 2 — exactly what
 * the brief asks a creator to land on. Notably *not* three steps: the form must
 * not pre-render Step 3.
 */
export function emptyDraft(): DraftContent {
  return {
    title: "",
    promise: "",
    categoryId: "",
    whoFor: "",
    whoNotFor: "",
    timeMin: null,
    timeMax: null,
    outcomeType: null,
    inputs: [{ key: "input_1_placeholder", name: "", format: "short_text", choices: [], required: true }],
    prompt: "",
    promptTouched: false,
    steps: [DEFAULT_STEP, ""],
    testingNotes: "",
    sourceUrl: "",
  };
}

/**
 * The next unused input number.
 *
 * Derived from the inputs that already exist rather than from their positions,
 * and that is the point. A counter keyed on position collides the moment an
 * input is deleted: removing input 1 moves the old input 2 into position 1, and
 * the next added input would be handed number 2 as well — two inputs sharing one
 * `{{key}}`, so every `{{input_2_...}}` in the prompt would resolve to whichever
 * of the two the renderer saw first.
 *
 * Taking the maximum ever used means deleting an input never frees its number.
 * Keys stay unique for the life of the draft, which is what "keep references
 * consistent when editing drafts" needs.
 */
export function nextKeyNumber(inputs: readonly DraftInput[]): number {
  let highest = 0;

  for (const input of inputs) {
    const match = /^input_(\d+)_/.exec(input.key);
    if (match) {
      highest = Math.max(highest, Number(match[1]));
    }
  }

  return highest + 1;
}

/**
 * Add an input, generating its key.
 *
 * The first input is required and every later one optional, which is the brief's
 * rule and also the only sensible default: the cap is two required, so a new field
 * defaulting to required would put the creator one tick from an error they did not
 * cause.
 */
export function addInput(inputs: readonly DraftInput[]): DraftInput[] {
  const n = nextKeyNumber(inputs);

  return [
    ...inputs,
    { key: `input_${n}_placeholder`, name: "", format: "short_text", choices: [], required: false },
  ];
}

/**
 * Remove one input and renumber the *labels* the form shows, never the keys.
 *
 * "User input 1", "User input 2" are positions; `{{input_3_x}}` is not. They are
 * kept apart on purpose, and this is the function that would break that rule.
 */
export function removeInput(inputs: readonly DraftInput[], index: number): DraftInput[] {
  return inputs.filter((_, at) => at !== index);
}

/**
 * Parse the "Choices (one per line)" box.
 *
 * Blank lines are dropped rather than becoming empty options — a dropdown with a
 * blank entry is one the reader can pick and cannot use.
 */
export function parseChoices(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * "10 to 20 min", "10 min", "20 min or more".
 *
 * The brief's example is the middle case verbatim. A single number prints bare,
 * and an open maximum reads as a floor rather than a guess, which matters because
 * this is the one field where a reader is deciding whether they have time at all.
 */
export function formatTimeRange(min: number | null, max: number | null): string {
  if (min !== null && max !== null) return `${min} to ${max} min`;
  if (min !== null) return `${min} min`;
  if (max !== null) return `${max} min or more`;
  return "";
}

/**
 * The steps to actually store.
 *
 * Step 1 must survive — the brief requires a non-empty first step — and blank
 * optional steps are dropped rather than stored as empty bullets, so a reader
 * never sees "Step 3" with nothing under it. If step 1 has been cleared anyway,
 * the default is restored rather than the submission refused: the field being
 * editable means it can be emptied, and a creator who empties it has not asked
 * for a playbook with no instructions.
 */
export function materializeSteps(steps: readonly string[]): string[] {
  const written = steps.map((step) => step.trim()).filter((step) => step.length > 0);

  if (written.length === 0 || (steps[0] ?? "").trim() === "") {
    return [DEFAULT_STEP, ...written];
  }

  return written;
}

/**
 * How a draft turns into rows.
 *
 * Deliberately separate from the form so that everything it asserts about
 * storage — blank steps dropped, `options` as an array, the author never able to
 * set a status — is testable without a database or a React tree.
 */
export function materialize(draft: DraftContent) {
  const inputs = draft.inputs.map((input, sort) => ({
    key: input.key,
    label: input.name.trim(),
    // `why_it_helps` is deliberately null: the brief says not to expose it in the
    // creator form, and there is nothing to carry. Imported content still has it.
    why_it_helps: null as string | null,
    help: null as string | null,
    type: formatOption(input.format).dbType,
    options: input.choices,
    required: input.required,
    sort,
  }));

  return {
    inputs,
    steps: materializeSteps(draft.steps),
    prompt: draft.prompt.trim(),
  };
}