import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";

import {
  extractPlaceholders,
  playbookSchema,
  placeholderProblems,
  type PlaybookFile,
} from "@/lib/content/schema";

/** A minimal playbook that parses cleanly. Tests mutate one field at a time so
 *  a failure names the rule that broke rather than "this object is invalid". */
const valid: PlaybookFile = {
  slug: "lower-your-internet-bill",
  title: "Lower your internet bill",
  promise: "Find a cheaper plan from your current provider.",
  category: "personal-finance",
  use_cases: ["cut-monthly-bills"],
  tags: ["isp"],
  status: "draft",
  who_for: "People paying more than they need to.",
  who_not_for: "",
  time: { min: 10, max: 20 },
  outcome: { type: "money_monthly", unit: "$/mo" },
  required_capability: "info",
  followup_days: 7,
  primary_agent: "muse",
  agents: [],
  preview_image: "",
  report_fields: {},
  inputs: [
    { key: "provider", label: "Your provider", type: "text", required: true, options: [] },
    { key: "monthly_bill", label: "Current monthly bill", type: "money", required: true, options: [] },
  ],
  prompt: "You are helping me lower my internet bill for {{provider}} at ${{monthly_bill}}.",
  steps: ["Enter details", "Copy the prompt into Muse"],
  sources: [],
  changelog: "",
  testing: null,
};

/** Parse a mutated copy, returning the issue messages. */
function problemsWith(mutate: (draft: PlaybookFile) => void): string[] {
  const draft = structuredClone(valid);
  mutate(draft);
  const result = playbookSchema.safeParse(draft);
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
}

/** Assert that some issue message contains `fragment`. Written as a substring
 *  search rather than `toContain(expect.stringContaining(...))` because Vitest's
 *  array `toContain` does not unwrap asymmetric matchers — it silently compares
 *  by identity and fails on a message that is in fact present. */
function expectProblem(problems: string[], fragment: string) {
  const match = problems.find((message) => message.includes(fragment));
  expect(match, `no issue mentioning "${fragment}" in:\n  ${problems.join("\n  ") || "(none)"}`).toBeDefined();
}

describe("playbookSchema", () => {
  it("accepts a well-formed playbook", () => {
    expect(problemsWith(() => {})).toEqual([]);
  });

  it("rejects a required input the prompt never uses", () => {
    const problems = problemsWith((draft) => {
      draft.prompt = "You are helping me lower my internet bill.";
    });
    expectProblem(problems, 'input "provider" is required but {{provider}} never appears');
  });

  it("allows an optional input the prompt never uses", () => {
    // An optional input the author did not reference is a deliberate choice:
    // it still appears on the "what you'll need" list, so it must not fail.
    const problems = problemsWith((draft) => {
      draft.inputs = [draft.inputs[0]!, { ...draft.inputs[1]!, required: false }];
      draft.prompt = "You are helping me lower my internet bill for {{provider}}.";
    });
    expect(problems).toEqual([]);
  });

  it("rejects a placeholder with no declared input", () => {
    const problems = problemsWith((draft) => {
      draft.prompt += " Compare against {{competitor}}.";
    });
    expectProblem(problems, "{{competitor}} but no input declares that key");
  });

  it("rejects a third required input", () => {
    // AGENTS.md caps the ask on the reader at two.
    const problems = problemsWith((draft) => {
      draft.inputs = [...draft.inputs, { key: "region", label: "Region", type: "zip", required: true, options: [] }];
    });
    expectProblem(problems, "at most 2 required inputs, found 3");
  });

  it("rejects a select with no options", () => {
    const problems = problemsWith((draft) => {
      draft.inputs = [
        { key: "provider", label: "Provider", type: "provider_picker", required: true, options: [] },
      ];
      draft.prompt = "Lower my bill for {{provider}}.";
    });
    expectProblem(problems, "provider_picker needs at least one option");
  });

  it("rejects duplicate input keys", () => {
    const problems = problemsWith((draft) => {
      draft.inputs = [draft.inputs[0]!, { ...draft.inputs[1]!, key: "provider" }];
      draft.prompt = "Lower my bill for {{provider}}.";
    });
    expectProblem(problems, 'duplicate input key "provider"');
  });

  it("rejects a time range that ends before it starts", () => {
    const problems = problemsWith((draft) => {
      draft.time = { min: 30, max: 5 };
    });
    expectProblem(problems, "is before time.min");
  });

  it("rejects a source with neither a url nor a handle", () => {
    // An empty link looks like a citation but cites nothing.
    const problems = problemsWith((draft) => {
      draft.sources = [{ platform: "x" }];
    });
    expectProblem(problems, "at least a url or a handle");
  });

  it("accepts a source identified only by handle", () => {
    const problems = problemsWith((draft) => {
      draft.sources = [{ platform: "x", handle: "@somebody" }];
    });
    expect(problems).toEqual([]);
  });
});

describe("extractPlaceholders", () => {
  it("finds each name once, however often it appears", () => {
    const names = extractPlaceholders("{{a}} then {{b}} then {{a}} again");
    expect(names.sort()).toEqual(["a", "b"]);
  });

  it("tolerates whitespace inside the braces", () => {
    expect(extractPlaceholders("{{ provider }}")).toEqual(["provider"]);
  });

  it("ignores single braces, which are not placeholders", () => {
    expect(extractPlaceholders("{provider} and {provider}")).toEqual([]);
  });
});

describe("placeholderProblems", () => {
  it("returns nothing for a consistent prompt and input list", () => {
    expect(placeholderProblems("Lower my {{provider}} bill", [{ key: "provider", required: true }])).toEqual([]);
  });

  it("reports an undeclared placeholder", () => {
    const problems = placeholderProblems("Lower my {{provider}} bill for {{region}}", [
      { key: "provider", required: true },
    ]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("{{region}}");
  });

  it("reports a required input the prompt ignores", () => {
    const problems = placeholderProblems("Lower my bill", [{ key: "provider", required: true }]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("required");
  });
});

describe("playbook_template.yaml", () => {
  /**
   * The template is what an author actually copies, so the two drifting apart is
   * the failure this guards: a field added to the schema is invisible to authors,
   * and a field left in the template is rejected with no way to see why.
   */
  const template = parseYaml(
    readFileSync(join(process.cwd(), "content/templates/playbook_template.yaml"), "utf8"),
  ) as Record<string, unknown>;

  it("uses only keys the schema declares", () => {
    const known = new Set(Object.keys(playbookSchema.shape));
    const unknown = Object.keys(template).filter((key) => !known.has(key));
    expect(unknown).toEqual([]);
  });

  it("documents every key the schema declares", () => {
    const documented = new Set(Object.keys(template));
    const missing = Object.keys(playbookSchema.shape).filter((key) => !documented.has(key));
    expect(missing).toEqual([]);
  });
});