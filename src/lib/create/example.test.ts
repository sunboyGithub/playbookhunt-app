import { describe, expect, it } from "vitest";

import { checkPromptReferences } from "@/lib/admin/prompt-refs";
import { generateExample, isGeneratedPrompt, syncPrompt } from "@/lib/create/example";
import { emptyDraft, type DraftInput } from "@/lib/create/shape";

const provider: DraftInput = {
  key: "input_1_provider",
  name: "Internet provider",
  format: "short_text",
  choices: [],
  required: true,
};

const plan: DraftInput = {
  key: "input_2_plan",
  name: "Internet plan",
  format: "short_text",
  choices: [],
  required: false,
};

describe("the generated example", () => {
  it("uses the title and every named input", () => {
    const prompt = generateExample("Lower your internet bill", [provider, plan]);

    expect(prompt).toContain("Lower your internet bill");
    expect(prompt).toContain("{{input_1_provider}}");
    expect(prompt).toContain("{{input_2_plan}}");
  });

  // The point of regenerating is that the two directions of the reference check
  // come out clean on an untouched example. A starter the creator cannot submit
  // without editing defeats its own purpose.
  it("leaves no unknown hole and no unused input", () => {
    const prompt = generateExample("Lower your internet bill", [provider, plan]);

    expect(checkPromptReferences(prompt, [provider.key, plan.key])).toEqual({
      unknown: [],
      unused: [],
    });
  });

  it("is submittable as written — real text, not a placeholder", () => {
    // The failure this guards against is a creator reading the grey example,
    // pressing Submit, and shipping an empty prompt.
    const prompt = generateExample("Lower your internet bill", [provider]);

    expect(prompt.trim().length).toBeGreaterThan(80);
    expect(prompt).not.toContain("placeholder=");
    expect(prompt).not.toContain("undefined");
  });

  it("says something usable before the title is typed", () => {
    expect(generateExample("", [provider]).length).toBeGreaterThan(80);
    expect(generateExample("   ", [])).toContain("no details yet");
  });

  it("omits an input the creator has not named yet", () => {
    // An unnamed input is one the submit validator refuses, so listing it here
    // would teach a bullet the creator cannot publish.
    const prompt = generateExample("Anything", [{ ...provider, name: "" }]);

    expect(prompt).not.toContain("{{input_1_provider}}");
    expect(prompt).not.toContain("- :");
  });

  it("follows a rename, which is the whole reason it regenerates", () => {
    const renamed = { ...provider, name: "Broadband provider" };

    expect(generateExample("Lower your internet bill", [renamed])).toContain("- Broadband provider:");
  });
});

describe("keeping the example in step until the creator takes over", () => {
  it("regenerates while untouched", () => {
    const synced = syncPrompt("New title", [provider], "stale", false);

    expect(synced.prompt).toBe(generateExample("New title", [provider]));
    expect(synced.touched).toBe(false);
  });

  // The brief's acceptance criterion: "editing it prevents later regeneration
  // from overwriting it, including after reload". Reload is the interesting half —
  // it means `promptTouched` has to be persisted, and it is why it is stored on
  // the draft rather than recomputed.
  it("never touches the creator's wording once they have edited it", () => {
    const mine = "I want to negotiate. Ask me for the bill first.";
    const synced = syncPrompt("Completely different title", [provider, plan], mine, true);

    expect(synced.prompt).toBe(mine);
    expect(synced.touched).toBe(true);
  });

  it("leaves a deliberately emptied prompt alone", () => {
    // Clearing the box is mid-edit, not a request to refill it.
    expect(syncPrompt("Title", [provider], "", true).prompt).toBe("");
  });

  it("survives a rename arriving after the edit", () => {
    const mine = "My own prompt.";
    const before = syncPrompt("Title", [provider], mine, true);
    const after = syncPrompt("Renamed afterwards", [{ ...provider, name: "Provider" }], before.prompt, before.touched);

    expect(after.prompt).toBe(mine);
  });
});

describe("telling generated text apart from written text", () => {
  it("recognises an untouched example", () => {
    const draft = { ...emptyDraft(), title: "Lower your internet bill", inputs: [provider] };
    const draftWithPrompt = { ...draft, prompt: generateExample(draft.title, draft.inputs) };

    expect(isGeneratedPrompt(draftWithPrompt)).toBe(true);
  });

  it("stops recognising it the moment the creator types", () => {
    const draft = { ...emptyDraft(), title: "Lower your internet bill", inputs: [provider], promptTouched: true };

    expect(isGeneratedPrompt({ ...draft, prompt: generateExample(draft.title, draft.inputs) })).toBe(
      false,
    );
  });

  it("does not mistake a hand-written prompt for the example", () => {
    const draft = { ...emptyDraft(), title: "Lower your internet bill", inputs: [provider], promptTouched: true };

    expect(isGeneratedPrompt({ ...draft, prompt: "Ask me for my bill." })).toBe(false);
  });
});