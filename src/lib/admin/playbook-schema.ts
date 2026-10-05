import { z } from "zod";

import { checkPromptReferences, describeMissingReferences } from "@/lib/admin/prompt-refs";

/**
 * What an administrator may write when editing a playbook.
 *
 * ## The split the brief asks for, made structural
 *
 * Core fields — title, promise, who it is for, status, preview image — are
 * edited in place. The *content* — prompt, inputs, steps — is edited by creating
 * a new version, because that is the only way the history of what a reader was
 * ever told survives. A published playbook's prompt is part of the claim it makes:
 * somebody read it, tried it, and reported on the result, so changing it in place
 * would silently rewrite the experiment their report belongs to.
 *
 * Two schemas rather than one with a `content` branch, because the difference is
 * not a field — it is which tables are written and what the version history
 * means.
 */

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value.length === 0 ? null : value))
    .nullish();

/**
 * The fields the editor can change on the playbook itself.
 *
 * `status` is here and not elsewhere because publishing is the single most
 * consequential button in the admin area: it puts a page on the internet and
 * starts the 15-minute cron counting tries for it.
 *
 * The enum has three of the column's four values, not four. `in_review` is
 * missing on purpose: it belongs to a creator's submission, it is set by
 * `submit_playbook` and cleared by a review decision, and letting this form write
 * it would mean a reviewer could push a playbook back into a queue they are not
 * looking at. `listAdminPlaybooks` excludes the same value, so this form is never
 * handed a row it cannot represent.
 */
export const coreFieldsSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(3, "Give it a title of at least 3 characters.").max(120),
  promise: z
    .string()
    .trim()
    .min(10, "The promise is one sentence — say what the reader gets.")
    .max(300),
  whoFor: optionalText(500),
  whoNotFor: optionalText(500),
  status: z.enum(["draft", "published", "archived"]),
  previewImageUrl: z
    .string()
    .trim()
    .max(500)
    .transform((value) => (value.length === 0 ? null : value))
    .nullish()
    .refine(
      (value) => value === null || value === undefined || /^https?:\/\//.test(value),
      "Use a full http or https URL.",
    ),
});

export type CoreFields = z.infer<typeof coreFieldsSchema>;

/** The input types a version may define — the same eight the reader's form has. */
export const INPUT_TYPES = [
  "text",
  "textarea",
  "select",
  "number",
  "money",
  "zip",
  "provider_picker",
  "date",
] as const;

export const inputSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1)
    .max(60)
    .regex(/^[a-z0-9_]+$/, "Keys are lowercase letters, numbers and underscores."),
  label: z.string().trim().min(1, "Every input needs a name.").max(80),
  type: z.enum(INPUT_TYPES),
  required: z.boolean(),
  help: optionalText(200),
  /** Only meaningful for the two choice types; kept as the stored options blob. */
  options: z.unknown().optional(),
});

export const stepSchema = z.object({
  body: z.string().trim().min(1).max(500),
});

/**
 * A new version of a playbook's content.
 *
 * The changelog is required and not optional-with-a-default, and that is the
 * whole of the "required changelog" requirement: a version with an empty
 * changelog is a version nobody can explain, and the first person to ask what
 * changed is the person reading the history two years later to work out why a
 * success rate moved.
 */
export const versionContentSchema = z.object({
  playbookId: z.string().uuid(),
  promptTemplate: z
    .string()
    .trim()
    .min(20, "A prompt this short is not a prompt.")
    .max(20_000),
  changelog: z
    .string()
    .trim()
    .min(5, "Say what changed — one line is enough.")
    .max(300),
  inputs: z.array(inputSchema).max(12),
  steps: z.array(stepSchema).max(10),
});

export type VersionContent = z.infer<typeof versionContentSchema>;

export type ContentValidation =
  | { ok: true; warnings: string[] }
  | { ok: false; error: string };

/**
 * The rules that need the whole version rather than any one field: the cap on
 * required inputs, and the prompt's placeholders.
 *
 * Separate from the schema because these are cross-field facts. Zod can express
 * them with `superRefine`, but a `superRefine` issue is reported against a path
 * the UI has to guess, and the version editor wants one sentence it can put
 * above the form — "the prompt uses a field that does not exist" — rather than
 * six of them attached to rows nobody highlighted.
 */
export function validateContent(input: {
  promptTemplate: string;
  inputs: readonly { key: string; label: string; required: boolean }[];
}): ContentValidation {
  const required = input.inputs.filter((row) => row.required);

  if (required.length > 2) {
    return {
      ok: false,
      error: `A playbook asks for at most two required inputs — this version marks ${required.length}.`,
    };
  }

  const labels = new Map(input.inputs.map((row) => [row.key, row.label]));
  const report = checkPromptReferences(input.promptTemplate, input.inputs.map((row) => row.key));

  // A hole with no input is fatal; the reader would paste the literal braces.
  if (report.unknown.length > 0) {
    return { ok: false, error: describeMissingReferences(report, labels) };
  }

  return {
    ok: true,
    warnings: report.unused.length > 0 ? [describeMissingReferences(report, labels)] : [],
  };
}