import { z } from "zod";

/**
 * Schema for a playbook authored as `content/playbooks/<slug>.yaml`.
 *
 * The shape follows `content/templates/playbook_template.yaml`, which is the
 * source of truth — this file describes what that template means, and
 * `playbook_template.test.ts` asserts the two have not drifted.
 *
 * Two rules here are not merely validation but product constraints, so they are
 * enforced where the content is authored rather than trusted at runtime:
 *
 *  - At most two required inputs. AGENTS.md caps the ask on the reader.
 *  - Every `{{placeholder}}` in the prompt must name a declared input, and every
 *    required input must appear. A prompt referencing an undeclared key would
 *    send a literal `{{provider}}` to the agent; an unused required input would
 *    make the reader fill in a field that changes nothing.
 */

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const CATEGORY_SLUGS = [
  "personal-finance",
  "travel-booking",
  "travel-planning",
  "shopping",
  "small-business",
  "productivity",
  "health",
  "creativity",
] as const;

export const OUTCOME_TYPES = [
  "money_monthly",
  "money_yearly",
  "money_once",
  "time_hours",
  "binary",
] as const;

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

export const CAPABILITIES = ["info", "web_actions", "phone_calls"] as const;

export const SOURCE_PLATFORMS = ["x", "threads", "reddit", "rednote", "other"] as const;

export const PLAYBOOK_STATUSES = ["draft", "published", "archived"] as const;

const slug = z
  .string()
  .min(1)
  .regex(SLUG_PATTERN, "must be lowercase-with-dashes, e.g. lower-your-internet-bill");

const hexColor = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, "must be a hex colour, e.g. #2F4F46");

export const playbookInputSchema = z
  .object({
    key: z
      .string()
      .min(1)
      .regex(/^[a-z0-9_]+$/, "must be lowercase, digits and underscores, as used in {{placeholders}}"),
    label: z.string().min(1),
    help: z.string().nullish(),
    type: z.enum(INPUT_TYPES),
    options: z.array(z.string()).default([]),
    required: z.boolean().default(false),
    why_it_helps: z.string().nullish(),
  })
  .superRefine((input, ctx) => {
    // `select` and `provider_picker` render a dropdown, which is meaningless
    // with no options to choose from.
    if ((input.type === "select" || input.type === "provider_picker") && input.options.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["options"],
        message: `${input.type} needs at least one option`,
      });
    }
  });

export type PlaybookInputFile = z.infer<typeof playbookInputSchema>;

export const playbookAgentSchema = z.object({
  slug: slug,
  tested: z.boolean().default(false),
  notes: z.string().nullish(),
});

export const playbookSourceSchema = z.object({
  platform: z.enum(SOURCE_PLATFORMS),
  handle: z.string().nullish(),
  url: z.string().nullish(),
  title: z.string().nullish(),
});

export const playbookSchema = z
  .object({
    slug,
    title: z.string().min(1).max(120),
    promise: z.string().min(1).max(300),
    category: z.enum(CATEGORY_SLUGS),
    use_cases: z.array(slug).default([]),
    tags: z.array(z.string()).default([]),
    status: z.enum(PLAYBOOK_STATUSES).default("draft"),

    who_for: z.string().default(""),
    who_not_for: z.string().default(""),
    time: z.object({
      min: z.number().int().min(0),
      max: z.number().int().min(0),
    }),
    outcome: z.object({
      type: z.enum(OUTCOME_TYPES),
      unit: z.string().default(""),
    }),
    required_capability: z.enum(CAPABILITIES).default("info"),
    followup_days: z.number().int().min(0).max(90).default(7),
    primary_agent: slug.default("muse"),
    agents: z.array(playbookAgentSchema).default([]),
    preview_image: z.string().default(""),

    report_fields: z
      .record(
        z.string(),
        z.object({
          type: z.string().optional(),
          options: z.array(z.string()).optional(),
        }),
      )
      .default({}),

    inputs: z.array(playbookInputSchema).default([]),
    prompt: z.string().min(1),
    steps: z.array(z.string().min(1)).min(1).max(5),
    sources: z.array(playbookSourceSchema).default([]),
    changelog: z.string().default(""),
    testing: z
      .object({
        tested_by: z.string().nullish(),
        tested_on: z.string().nullish(),
        runs: z.number().int().min(0).default(0),
        result_notes: z.string().nullish(),
      })
      .nullish(),
  })
  .superRefine((playbook, ctx) => {
    if (playbook.time.max < playbook.time.min) {
      ctx.addIssue({
        code: "custom",
        path: ["time", "max"],
        message: `time.max (${playbook.time.max}) is before time.min (${playbook.time.min})`,
      });
    }

    const keys = playbook.inputs.map((input) => input.key);
    const duplicates = keys.filter((key, index) => keys.indexOf(key) !== index);
    for (const key of new Set(duplicates)) {
      ctx.addIssue({
        code: "custom",
        path: ["inputs"],
        message: `duplicate input key "${key}"`,
      });
    }

    const requiredCount = playbook.inputs.filter((input) => input.required).length;
    if (requiredCount > 2) {
      ctx.addIssue({
        code: "custom",
        path: ["inputs"],
        message: `a playbook may ask for at most 2 required inputs, found ${requiredCount}. Make the rest optional and explain why in why_it_helps.`,
      });
    }

    for (const problem of placeholderProblems(playbook.prompt, playbook.inputs)) {
      ctx.addIssue({ code: "custom", path: ["prompt"], message: problem });
    }

    // AGENTS.md: only real sources, no empty URLs. A link to nothing is worse
    // than no link, because it looks like a citation.
    for (const [index, source] of playbook.sources.entries()) {
      if (!source.url && !source.handle) {
        ctx.addIssue({
          code: "custom",
          path: ["sources", index],
          message: "a source needs at least a url or a handle",
        });
      }
    }
  });

export type PlaybookFile = z.infer<typeof playbookSchema>;

/** `{{name}}` — a double-brace placeholder, not a bare word. */
const PLACEHOLDER_PATTERN = /\{\{\s*([a-z0-9_]+)\s*\}\}/g;

export function extractPlaceholders(prompt: string): string[] {
  const found = new Set<string>();
  for (const match of prompt.matchAll(PLACEHOLDER_PATTERN)) {
    found.add(match[1]!);
  }
  return [...found];
}

/**
 * Mismatches between the prompt and the declared inputs.
 *
 * Returned as messages rather than thrown so the caller decides how to report
 * them — the importer needs file and field context, the tests need a list.
 */
export function placeholderProblems(
  prompt: string,
  inputs: { key: string; required: boolean }[],
): string[] {
  const problems: string[] = [];
  const keys = new Set(inputs.map((input) => input.key));
  const used = new Set(extractPlaceholders(prompt));

  for (const name of used) {
    if (!keys.has(name)) {
      problems.push(
        `prompt uses {{${name}}} but no input declares that key. Add the input, or fix the spelling.`,
      );
    }
  }

  // Only *required* inputs are worth complaining about when unused. An optional
  // input the author chose not to reference in the prompt is a deliberate style
  // choice — it still appears on the "what you'll need" list. A required field
  // that is never used makes the reader do work for nothing.
  for (const input of inputs) {
    if (input.required && !used.has(input.key)) {
      problems.push(
        `input "${input.key}" is required but {{${input.key}}} never appears in the prompt, so filling it in would change nothing.`,
      );
    }
  }

  return problems;
}

export const useCaseSchema = z.object({
  slug,
  title: z.string().min(1),
  description: z.string().default(""),
  gradient: z.tuple([hexColor, hexColor]),
  sort: z.number().int().default(0),
  playbooks: z.array(slug).default([]),
});

export const starterKitSchema = z.object({
  slug,
  title: z.string().min(1),
  blurb: z.string().default(""),
  illustration: z.string().default(""),
  featured: z.boolean().default(false),
  playbooks: z.array(slug).default([]),
});

export const catalogSchema = z.object({
  use_cases: z.array(useCaseSchema).default([]),
  starter_kits: z.array(starterKitSchema).default([]),
  // Present because the template asks for it, but the categories table is owned
  // by the seed migration — see `CATEGORIES_OWNED_BY_MIGRATION` in the importer.
  categories: z
    .array(
      z.object({
        slug: z.enum(CATEGORY_SLUGS),
        name: z.string(),
        icon: z.string(),
      }),
    )
    .default([]),
});

export type CatalogFile = z.infer<typeof catalogSchema>;