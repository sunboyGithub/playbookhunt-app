import { describe, expect, it } from "vitest";

import { ERROR_ORDER, draftPayloadSchema, errorsFromIssues, firstError, submissionSchema, type DraftPayload } from "@/lib/create/schema";
import { emptyDraft, type DraftInput } from "@/lib/create/shape";

const input = (over: Partial<DraftInput> = {}): DraftInput => ({
  key: "input_1_provider",
  name: "Internet provider",
  format: "short_text",
  choices: [],
  required: true,
  ...over,
});

/** A payload that passes, so each test can break exactly one thing. */
function valid(): DraftPayload {
  return {
    title: "Lower your internet bill",
    promise: "Find you a cheaper plan and tell you exactly what to ask for.",
    categoryId: "11111111-1111-1111-1111-111111111111",
    whoFor: "Anyone paying more than they need to for internet.",
    whoNotFor: "",
    timeMin: 10,
    timeMax: 20,
    outcomeType: "money_monthly",
    inputs: [input()],
    prompt: "I am on {{input_1_provider}}. Help me cut this bill.",
    promptTouched: true,
    steps: ["Enter your details, then copy the prompt into Muse."],
    testingNotes: "Saved $40 in one go.",
    sourceUrl: "",
  };
}

function errorsFor(payload: unknown): Record<string, string> {
  const parsed = submissionSchema.safeParse(payload);
  return parsed.success ? {} : errorsFromIssues(parsed.error);
}

describe("a complete submission", () => {
  it("is accepted", () => {
    expect(submissionSchema.safeParse(valid()).success).toBe(true);
  });

  it("accepts a playbook with no optional extras filled in", () => {
    // Everything except the required content is optional, and a creator who has
    // said the minimum must not be stopped by a field they never planned to fill.
    const payload = valid();
    payload.whoFor = "";
    payload.whoNotFor = "";
    payload.timeMin = null;
    payload.timeMax = null;
    payload.testingNotes = "";
    payload.sourceUrl = "";

    expect(submissionSchema.safeParse(payload).success).toBe(true);
  });

  it("accepts exactly two required inputs", () => {
    const payload = valid();
    payload.inputs = [
      input(),
      input({ key: "input_2_plan", name: "Internet plan", required: true }),
    ];

    expect(submissionSchema.safeParse(payload).success).toBe(true);
  });
});

describe("privileged fields", () => {
  // The materializer is a trusted, dumb translation — it is also what runs on
  // content the server validated. So nothing downstream re-checks these, and
  // `.strict()` is the whole of the defence.
  it.each([
    ["status", { status: "published" }],
    ["authorId", { authorId: "11111111-1111-1111-1111-111111111111" }],
    ["successRate", { success_rate: 100 }],
    ["reportCount", { report_count: 500 }],
    ["stats", { stats: { reports: 99 } }],
  ])("refuses a payload carrying %s", (_field, extra) => {
    expect(submissionSchema.safeParse({ ...valid(), ...extra }).success).toBe(false);
  });

  it("refuses a privileged field nested inside an input too", () => {
    const payload = valid();
    payload.inputs = [input({ key: "input_1_x", extra: "anything" } as Partial<DraftInput>)];

    expect(submissionSchema.safeParse(payload).success).toBe(false);
  });
});

describe("naming the missing thing", () => {
  it("reports each required field by the words the form shows", () => {
    const payload = valid();
    payload.title = "  ";
    payload.promise = "";
    payload.categoryId = "";
    payload.outcomeType = null;

    const errors = errorsFor(payload);

    expect(errors.title).toContain("title");
    expect(errors.promise).toContain("one sentence");
    expect(errors.categoryId).toBe("Choose a category.");
    expect(errors.outcomeType).toContain("result");
  });

  it("identifies which user input is unnamed", () => {
    const payload = valid();
    payload.inputs = [input({ name: "" }), input({ key: "input_2_plan", name: "" })];

    expect(errorsFor(payload)["inputs.0.name"]).toBe("User input 1 needs a name.");
    expect(errorsFor(payload)["inputs.1.name"]).toBe("User input 2 needs a name.");
  });

  it("refuses a third required input and says how many are marked", () => {
    const payload = valid();
    payload.inputs = [
      input(),
      input({ key: "input_2_plan", name: "Plan", required: true }),
      input({ key: "input_3_region", name: "Region", required: true }),
    ];

    expect(errorsFor(payload).inputs).toBe(
      "Mark at most 2 inputs as required. 3 are required now.",
    );
  });

  it("names a choice input with no choices", () => {
    const payload = valid();
    payload.inputs = [input({ format: "dropdown_choices", choices: [] })];

    expect(errorsFor(payload)["inputs.0.choices"]).toContain("Internet provider");
  });

  it("explains a placeholder with no input, using the input names", () => {
    const payload = valid();
    payload.prompt = "I am on {{input_9_typo}}. Help me.";

    // A hole with no input is fatal: the reader pastens the literal braces.
    expect(errorsFor(payload).prompt).toContain("input_9_typo");
  });

  it("does not refuse a prompt for leaving an optional input unmentioned", () => {
    // `checkPromptReferences` calls this a warning for the admin editor and the
    // reasoning transfers: an optional field can be asked for by a *step* instead.
    const payload = valid();
    payload.inputs = [input(), input({ key: "input_2_notes", name: "Notes", required: false })];
    payload.prompt = "I am on {{input_1_provider}}. Help me.";

    expect(submissionSchema.safeParse(payload).success).toBe(true);
  });

  it("refuses an empty prompt", () => {
    const payload = valid();
    payload.prompt = "   ";

    expect(errorsFor(payload).prompt).toContain("paste into Muse");
  });

  it("refuses an empty first step, naming the prefilled default", () => {
    const payload = valid();
    payload.steps = [""];

    expect(errorsFor(payload).steps).toContain("prefilled sentence");
  });
});

describe("the time estimate", () => {
  it("accepts a maximum equal to the minimum", () => {
    const payload = valid();
    payload.timeMin = 15;
    payload.timeMax = 15;

    expect(submissionSchema.safeParse(payload).success).toBe(true);
  });

  it("names both numbers when the range is reversed", () => {
    const payload = valid();
    payload.timeMin = 20;
    payload.timeMax = 10;

    const message = errorsFor(payload).timeMax;

    expect(message).toContain("10");
    expect(message).toContain("20");
  });

  it("rejects a negative minimum at the schema rather than in a message", () => {
    const payload = valid();
    payload.timeMin = -1;

    expect(submissionSchema.safeParse(payload).success).toBe(false);
  });
});

describe("which error a creator is sent to first", () => {
  it("follows the order of the six sections, not the order of the object", () => {
    // Every field is broken. The title is first in the form and must be first in
    // the focus order, or a creator is sent to the bottom of a long page first.
    const broken = {
      ...valid(),
      title: "",
      promise: "",
      categoryId: "",
      outcomeType: null,
      prompt: "",
    };

    expect(firstError(errorsFor(broken))).toBe("title");
  });

  it("reaches the inputs after the fields above them", () => {
    const payload = valid();
    payload.promise = "";
    payload.inputs = [input({ name: "" })];

    expect(firstError(errorsFor(payload))).toBe("promise");
  });

  it("still focuses something when a field is not in the declared order", () => {
    // A newly added rule must not become unfocusable just because ERROR_ORDER
    // has not caught up.
    expect(firstError({ "inputs.7.name": "User input 8 needs a name." })).toBe("inputs.7.name");
  });

  it("has no first error when nothing is wrong", () => {
    expect(firstError(errorsFor(valid()))).toBeNull();
  });

  it("lists every ordered key exactly once", () => {
    expect(new Set(ERROR_ORDER).size).toBe(ERROR_ORDER.length);
  });
});

describe("turning issues into messages", () => {
  it("keeps the first message per field", () => {
    const payload = valid();
    payload.title = "";

    const errors = errorsFor(payload);

    expect(Object.keys(errors).filter((key) => key === "title")).toHaveLength(1);
  });

  it("replaces a structural failure with plain words", () => {
    // Not the constraint text: nobody can act on "expected number".
    const parsed = submissionSchema.safeParse({ ...valid(), timeMin: "soon" });

    expect(parsed.success).toBe(false);
    expect(errorsFromIssues(parsed.error!).timeMin).toBe("Check this and try again.");
  });

  it("names an unexpected field instead of filing the error nowhere", () => {
    // Regression. `.strict()` reports an extra key against the *object*, so the
    // issue's path is empty and `pathToKey` returned "". The message landed under
    // a key no control has, which the form can neither render against nor focus —
    // and the save action, which was also returning the *key* where it wanted a
    // sentence, sent the creator a blank message. So: the field is named.
    const parsed = draftPayloadSchema.safeParse({ ...emptyDraft(), touched: true });

    expect(parsed.success).toBe(false);

    const errors = errorsFromIssues(parsed.error!);
    const messages = Object.values(errors);

    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain("touched");
  });
});

describe("a draft that is not a submission", () => {
  // The brief: "Save draft must work without satisfying submission requirements",
  // and every one of those requirements lives in `submissionSchema`. The payload
  // schema is what the save action validates against, so this is the assertion
  // that the two really are separate — a brand-new form has no title, no promise,
  // no category and an unnamed input, and none of that may block a save.
  it("accepts a completely empty draft", () => {
    expect(draftPayloadSchema.safeParse(emptyDraft()).success).toBe(true);
  });

  it("accepts a draft with an unnamed input, which no submission could", () => {
    const draft = emptyDraft();
    expect(draftPayloadSchema.safeParse(draft).success).toBe(true);
    expect(submissionSchema.safeParse(draft).success).toBe(false);
  });

  it("still refuses a privileged field on a save", () => {
    // Saving is not a weaker form of submitting; it writes to the same column.
    expect(draftPayloadSchema.safeParse({ ...emptyDraft(), status: "published" }).success).toBe(false);
  });

  it("still refuses a malformed shape", () => {
    expect(draftPayloadSchema.safeParse({ ...emptyDraft(), promptTouched: "yes" }).success).toBe(false);
  });
});
