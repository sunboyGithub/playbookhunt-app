import { z } from "zod";

import { checkPromptReferences, describeMissingReferences } from "@/lib/admin/prompt-refs";
import {
  INPUT_FORMATS,
  MAX_INPUTS,
  MAX_REQUIRED_INPUTS,
  OUTCOME_OPTIONS,
  type DraftInput,
  type InputFormat,
} from "@/lib/create/shape";
import type { OutcomeType } from "@/lib/report/shape";

/**
 * What the create form may send, and what it may not.
 *
 * ## The strictness is the security property
 *
 * `.strict()` on both schemas is not tidiness. The server action takes whatever
 * the browser sends and writes it into `playbook_drafts.content`, then
 * materializes it into `playbooks`, `playbook_inputs` and `playbook_steps`. A
 * permissive schema here would let a hand-rolled request set `stats`,
 * `success_rate`, `report_count`, `author_id` or `status` and have them land,
 * because nothing downstream re-checks them — the materializer is a dumb, trusted
 * translation on purpose, since it is also what runs on content the server itself
 * validated.
 *
 * So the rejection is structural rather than a list of things to remember to
 * strip: a key that is not in the schema does not reach the database, whatever it
 * is called. That is the same reason `reportSchema` fixes its own shape.
 *
 * ## Two schemas, not one with a mode flag
 *
 * A draft is savable at every point — the brief requires it, and it is the
 * difference between a two-minute form and a form people abandon. None of the
 * submission rules apply to it. Encoding that as `strict: boolean` in one schema
 * would mean every rule reads `if (!draft)`, and the next person to add a rule
 * would forget the guard. Two schemas make "what a draft must satisfy" and "what
 * a submission must satisfy" separately readable.
 */

const formatSchema = z.enum(
  INPUT_FORMATS.map((option) => option.format) as [InputFormat, ...InputFormat[]],
);

/**
 * One input as it arrives from the browser.
 *
 * `key` is present because the form sends it, not because the creator supplied it
 * — the key is generated on the client and round-tripped so that a draft reloaded
 * from storage keeps the keys its prompt already references. It is re-validated
 * against the key pattern rather than trusted, since a key that does not match
 * would produce a `playbook_inputs` row that cannot be referenced and would fail
 * the column's own constraint later, far from the request that caused it.
 */
const inputSchema = z
  .object({
    key: z.string().regex(/^[a-z0-9_]+$/, "generated keys are lowercase letters, digits and underscores"),
    name: z.string(),
    format: formatSchema,
    choices: z.array(z.string()),
    required: z.boolean(),
  })
  .strict();

/** The payload accepted for both saving and submitting. */
export const draftPayloadSchema = z
  .object({
    title: z.string(),
    promise: z.string(),
    categoryId: z.string(),
    whoFor: z.string(),
    whoNotFor: z.string(),
    /** `null` means unanswered, which is different from zero. */
    timeMin: z.number().int().min(0).nullable(),
    timeMax: z.number().int().min(0).nullable(),
    outcomeType: z
      .enum(OUTCOME_OPTIONS.map((option) => option.value) as [OutcomeType, ...OutcomeType[]])
      .nullable(),
    inputs: z.array(inputSchema).max(MAX_INPUTS),
    prompt: z.string(),
    promptTouched: z.boolean(),
    /**
     * Capped at 20 rather than at the form's own `MAX_STEPS` of 5. The cap on
     * the Add button is what a creator meets while writing; this one is about what
     * the form can still *hold*, and a draft restored from an older, longer one
     * has to survive a save without the form losing rows it cannot re-add.
     */
    steps: z.array(z.string()).max(20),
    testingNotes: z.string(),
    sourceUrl: z.string(),
  })
  .strict();

export type DraftPayload = z.infer<typeof draftPayloadSchema>;

/**
 * Everything a submission adds on top of a valid payload.
 *
 * Expressed as a refine over the payload rather than a second parallel object
 * type, so a new field cannot be added to one and forgotten in the other.
 *
 * ## Why `superRefine`, when `playbook-schema.ts` argues against it
 *
 * That file deliberately keeps cross-field rules *out* of zod, on the grounds that
 * "a `superRefine` issue is reported against a path the UI has to guess". That
 * reasoning is right there and wrong here, and the difference is worth stating
 * rather than leaving as an apparent contradiction.
 *
 * The admin version editor wants **one sentence above the form** — it validates the
 * whole version and shows a single verdict. This form has the opposite
 * requirement: the brief says "display clear messages next to each invalid field,
 * highlight it, and focus the first invalid field on submission". A validator
 * returning one sentence cannot do that, and converting it into field messages
 * afterwards would mean re-deriving which field it meant — which is exactly the
 * guess the other file was avoiding.
 *
 * So the paths are the contract here. They are declared, they are stable, and
 * {@link ERROR_ORDER} is the form's render and focus order for them. That is why
 * these rules carry an explicit `path` on every issue rather than relying on a
 * later inference step.
 */
export const submissionSchema = draftPayloadSchema.superRefine((draft, ctx) => {
  const add = (path: string[], message: string) => {
    ctx.addIssue({ code: "custom", path, message });
  };

  if (draft.title.trim().length === 0) {
    add(["title"], "Give the playbook a title — what the person using it will get.");
  } else if (draft.title.trim().length > 120) {
    add(["title"], "Keep the title to 120 characters or fewer.");
  }

  if (draft.promise.trim().length === 0) {
    add(["promise"], "Add one sentence saying what the person using this playbook gets.");
  } else if (draft.promise.trim().length > 300) {
    add(["promise"], "Keep the promise to one sentence, under 300 characters.");
  }

  if (draft.categoryId.trim().length === 0) {
    add(["categoryId"], "Choose a category.");
  }

  if (draft.outcomeType === null) {
    add(["outcomeType"], "Choose what result this playbook measures.");
  }

  if (draft.timeMin !== null && draft.timeMax !== null && draft.timeMax < draft.timeMin) {
    // Both directions are named rather than only the larger one, because "20 to 10"
    // is what the creator typed and telling them only that the maximum is too
    // small sends them looking at the wrong number.
    add(
      ["timeMax"],
      `The longest time (${draft.timeMax} min) cannot be shorter than the shortest (${draft.timeMin} min).`,
    );
  }

  validateInputs(draft.inputs, add);

  if (draft.prompt.trim().length === 0) {
    add(["prompt"], "Write the prompt someone will paste into Muse.");
  } else {
    const keys = draft.inputs.map((input) => input.key);
    const report = checkPromptReferences(draft.prompt, keys);
    const labels = new Map(
      draft.inputs.map((input) => [input.key, input.name.trim() || input.key] as const),
    );

    // Only the fatal direction is refused. An unused input is a style problem —
    // `checkPromptReferences` documents that for the admin editor, and the same
    // reasoning holds here: an optional field can be asked for by a *step*.
    // Refusing it would push creators towards prompts that name everything.
    if (report.unknown.length > 0) {
      add(["prompt"], describeMissingReferences({ ...report, unused: [] }, labels));
    }
  }

  if (draft.steps[0]?.trim() === undefined || draft.steps[0]?.trim().length === 0) {
    add(["steps"], "Step 1 is required. The prefilled sentence is enough to publish with.");
  }
});

function validateInputs(
  inputs: readonly DraftInput[],
  add: (path: string[], message: string) => void,
) {
  if (inputs.length === 0) {
    add(["inputs"], "Add at least one user input so the form has something to fill in.");
    return;
  }

  const required = inputs.filter((input) => input.required);

  if (required.length > MAX_REQUIRED_INPUTS) {
    add(
      ["inputs"],
      `Mark at most ${MAX_REQUIRED_INPUTS} inputs as required. ${required.length} are required now.`,
    );
  }

  inputs.forEach((input, index) => {
    if (input.name.trim().length === 0) {
      add([`inputs.${index}.name`], `User input ${index + 1} needs a name.`);
    }

    const option = INPUT_FORMATS.find((entry) => entry.format === input.format);

    if (option?.hasChoices && input.choices.length === 0) {
      add(
        [`inputs.${index}.choices`],
        `“${input.name.trim() || `User input ${index + 1}`}” needs at least one choice, one per line.`,
      );
    }
  });
}

/**
 * Field-keyed validation messages, in creator language.
 *
 * ## Why this exists separately from the zod issues
 *
 * The brief forbids concatenating schema errors, and for this audience the reason
 * is not polish. A creator who typed "Internet provider" into a field and was told
 * `expected string, received undefined at inputs.0.name` learns nothing and cannot
 * act. The messages here name the field by the same words the form uses — "User
 * input 1" — because the thing on screen has that label, not `inputs.0.name`.
 *
 * The shape is a flat record rather than a nested tree because the form reads it
 * one control at a time while rendering, and a nested error object would put the
 * indexing in the render path.
 */
export type DraftErrors = Record<string, string>;

/**
 * Order errors are reported and focused in.
 *
 * Also the order the six numbered sections appear in, which means the first
 * message a creator sees is always the first thing they have not done rather than
 * an arbitrary key from an object — and, since the form is one long page, the
 * focus target is in the section the jump links name.
 */
export const ERROR_ORDER = [
  "title",
  "promise",
  "categoryId",
  "whoFor",
  "whoNotFor",
  "timeMax",
  "outcomeType",
  "inputs",
  "inputs.0.name",
  "inputs.0.choices",
  "inputs.1.name",
  "inputs.1.choices",
  "prompt",
  "steps",
  "testingNotes",
  "sourceUrl",
] as const;

/** The error a creator should be sent to first, or null when there is none. */
export function firstError(errors: DraftErrors): string | null {
  for (const key of ERROR_ORDER) {
    if (errors[key]) return key;
  }

  // Anything not in the ordering — a newly added rule, a multi-input case beyond
  // the two enumerated above — still gets focused rather than being silently
  // dropped.
  return Object.keys(errors)[0] ?? null;
}

function pathToKey(path: ReadonlyArray<PropertyKey>): string {
  // zod types `issue.path` as `PropertyKey[]`, but a path is only ever built from
  // object keys and array indices — a `symbol` cannot reach here, and `String` of
  // one would throw rather than produce a field name.
  return path.map((segment) => String(segment)).join(".");
}

/**
 * Turn a submission failure into field messages.
 *
 * Everything that is not a `custom` issue is replaced with a whole-form message,
 * because a structural failure here means the payload was malformed rather than
 * that a field is wrong — and the honest thing to say about that is "check the
 * form and try again", not the constraint text.
 */
export function errorsFromIssues(error: z.ZodError): DraftErrors {
  const errors: DraftErrors = {};

  for (const issue of error.issues) {
    // An extra key is reported by `.strict()` against the *object*, not against
    // the key, so `issue.path` is empty and `pathToKey` returns "". Left alone
    // that writes an error under a field name no control has, which the form can
    // neither render against nor focus. The offending keys are on the issue, so
    // they are named here — otherwise `.strict()` rejects the payload and tells
    // the creator nothing at all about what was wrong with it.
    if (issue.code === "unrecognized_keys") {
      const at = pathToKey(issue.path);
      const names = [...issue.keys];
      const sentence = `This draft has ${names.length === 1 ? "a field" : "fields"} it should not: ${names.join(", ")}.`;

      if (!errors[at]) {
        errors[at] = sentence;
      }

      continue;
    }

    const key = pathToKey(issue.path);

    // First message wins: zod reports every constraint, and a field that is both
    // empty and too long does not need both sentences.
    if (!errors[key]) {
      errors[key] = issue.code === "custom" ? issue.message : "Check this and try again.";
    }
  }

  return errors;
}

/** True when a draft satisfies everything a submission requires. */
export function isSubmittable(draft: DraftPayload): boolean {
  return submissionSchema.safeParse(draft).success;
}