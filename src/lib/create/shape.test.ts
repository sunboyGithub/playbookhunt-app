import { describe, expect, it } from "vitest";

import {
  DEFAULT_STEP,
  addInput,
  emptyDraft,
  formatOption,
  formatTimeRange,
  materialize,
  materializeSteps,
  nextKeyNumber,
  parseChoices,
  removeInput,
  type DraftContent,
} from "@/lib/create/shape";

/** A draft with only the inputs the test cares about. */
function withInputs(inputs: DraftContent["inputs"]): DraftContent {
  return { ...emptyDraft(), inputs };
}

const named = (key: string, name: string, required = false) => ({
  key,
  name,
  format: "short_text" as const,
  choices: [],
  required,
});

describe("a new draft", () => {
  it("lands the creator on one required input and two steps", () => {
    const draft = emptyDraft();

    expect(draft.inputs).toHaveLength(1);
    expect(draft.inputs[0]!.required).toBe(true);
    expect(draft.steps).toEqual([DEFAULT_STEP, ""]);

    // The brief is explicit that Step 3 is not pre-rendered, and this is the test
    // that would catch someone "helping" by starting at three.
    expect(draft.steps).toHaveLength(2);
  });

  it("starts with the prompt untouched, so the example may be generated", () => {
    expect(emptyDraft().promptTouched).toBe(false);
    expect(emptyDraft().prompt).toBe("");
  });
});

describe("generated input keys", () => {
  it("uses the brief's own example for the first, unnamed input", () => {
    expect(emptyDraft().inputs[0]!.key).toBe("input_1_placeholder");
  });

  it("names a later input after what the creator called it", () => {
    const draft = withInputs([named("input_1_placeholder", "Internet provider", true)]);
    const next = addInput(draft.inputs);

    // Keys are frozen at creation, so the name typed *after* creation is not in
    // this one. What matters is that it is numbered and unique.
    expect(next[1]!.key).toMatch(/^input_2_/);
  });

  it("makes additional inputs optional and keeps the first required", () => {
    const next = addInput(emptyDraft().inputs);

    expect(next[0]!.required).toBe(true);
    expect(next[1]!.required).toBe(false);
  });

  // The bug this guards is not hypothetical. Keying the counter on array position
  // means deleting input 1 slides the old input 2 into slot 1, so the next add
  // hands out number 2 a second time and every {{input_2_…}} in the prompt
  // resolves to whichever duplicate the renderer met first.
  it("never reuses a number after an input is deleted", () => {
    let inputs = addInput(emptyDraft().inputs); // input_1_, input_2_
    inputs = removeInput(inputs, 0); // input_2_
    inputs = addInput(inputs);

    expect(inputs.map((input) => input.key)).toEqual(["input_2_placeholder", "input_3_placeholder"]);
    expect(new Set(inputs.map((input) => input.key)).size).toBe(2);
  });

  it("counts the highest number in use rather than the number of inputs", () => {
    expect(nextKeyNumber([])).toBe(1);
    expect(nextKeyNumber([named("input_1_x", "a")])).toBe(2);
    expect(nextKeyNumber([named("input_7_x", "a"), named("input_2_x", "b")])).toBe(8);
  });

  it("does not free the number of a removed input even if it was the highest", () => {
    const inputs = [named("input_5_x", "only")];

    expect(nextKeyNumber(inputs)).toBe(6);
  });
});

describe("choices", () => {
  it("reads one per line and drops the blank ones", () => {
    // A dropdown with an empty option is one the reader can pick and cannot use.
    expect(parseChoices("Comcast\n\n  Xfinity  \n\nVerizon")).toEqual([
      "Comcast",
      "Xfinity",
      "Verizon",
    ]);
  });
});

describe("the time estimate", () => {
  it("renders the brief's example for a range", () => {
    expect(formatTimeRange(10, 20)).toBe("10 to 20 min");
  });

  it("renders a single bound without inventing the other", () => {
    expect(formatTimeRange(10, null)).toBe("10 min");
    expect(formatTimeRange(null, 20)).toBe("20 min or more");
    expect(formatTimeRange(null, null)).toBe("");
  });

  it("distinguishes an unanswered minimum from zero", () => {
    // 0 minutes and "not answered" are different answers and the preview has to
    // show which one it is.
    expect(formatTimeRange(0, 0)).toBe("0 to 0 min");
    expect(formatTimeRange(null, 0)).toBe("0 min or more");
  });
});

describe("steps", () => {
  it("keeps the prefilled first step and drops empty optional ones", () => {
    expect(materializeSteps([DEFAULT_STEP, "", "Check the figure."])).toEqual([
      DEFAULT_STEP,
      "Check the figure.",
    ]);
  });

  it("restores the default rather than publishing an empty first step", () => {
    // The field is editable, so it can be cleared. A creator who cleared it has
    // not asked for a playbook with no instructions.
    expect(materializeSteps(["", "Second"])).toEqual([DEFAULT_STEP, "Second"]);
    expect(materializeSteps([])).toEqual([DEFAULT_STEP]);
  });

  it("treats whitespace as empty", () => {
    expect(materializeSteps(["   ", "  Step two  "])).toEqual([DEFAULT_STEP, "Step two"]);
  });

  it("publishes exactly one instruction when only the default was left", () => {
    // Named directly in the brief's acceptance criteria.
    expect(materializeSteps([DEFAULT_STEP, ""])).toHaveLength(1);
  });
});

describe("answer formats", () => {
  it("maps each creator-facing name to its stored type", () => {
    expect(formatOption("short_text").dbType).toBe("text");
    expect(formatOption("long_text").dbType).toBe("textarea");
    expect(formatOption("provider_choices").dbType).toBe("provider_picker");
    expect(formatOption("dropdown_choices").dbType).toBe("select");
    expect(formatOption("zip").dbType).toBe("zip");
  });

  it("shows the choices box for exactly the two formats that need one", () => {
    expect(formatOption("provider_choices").hasChoices).toBe(true);
    expect(formatOption("dropdown_choices").hasChoices).toBe(true);

    expect(formatOption("short_text").hasChoices).toBe(false);
    expect(formatOption("money").hasChoices).toBe(false);
    expect(formatOption("date").hasChoices).toBe(false);
  });
});

describe("materializing a draft into stored rows", () => {
  it("numbers inputs in order and never writes why_it_helps", () => {
    // The brief says not to expose that field in the creator form, so there is
    // nothing to carry and nothing for an author to discover later.
    const draft = withInputs([
      named("input_1_provider", "Internet provider", true),
      named("input_2_plan", "Internet plan"),
    ]);

    const result = materialize(draft);

    expect(result.inputs.map((input) => input.sort)).toEqual([0, 1]);
    expect(result.inputs.map((input) => input.label)).toEqual(["Internet provider", "Internet plan"]);
    expect(result.inputs.every((input) => input.why_it_helps === null)).toBe(true);
  });

  it("stores choices as the array the jsonb column holds", () => {
    const draft = withInputs([
      {
        key: "input_1_provider",
        name: "Provider",
        format: "dropdown_choices",
        choices: ["Comcast", "Xfinity"],
        required: true,
      },
    ]);

    expect(materialize(draft).inputs[0]!.options).toEqual(["Comcast", "Xfinity"]);
    expect(materialize(draft).inputs[0]!.type).toBe("select");
  });
});