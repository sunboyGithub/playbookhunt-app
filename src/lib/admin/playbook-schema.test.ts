import { describe, expect, it } from "vitest";

import {
  coreFieldsSchema,
  inputSchema,
  validateContent,
  versionContentSchema,
} from "@/lib/admin/playbook-schema";

/**
 * What an administrator is allowed to save, and the two rules that need the whole
 * version rather than one field.
 *
 * The two that are refusals rather than shapes:
 *
 * - At most two required inputs. A playbook that asks for five things before it
 *   will help is a form, and the whole premise is that this is faster than
 *   working it out yourself.
 * - No placeholder without an input. The reader pastes braces otherwise.
 *
 * And the one that is a warning: an input the prompt never mentions is allowed,
 * because an optional input is often there for an instruction rather than for
 * the prompt.
 */

const CORE = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Cancel a subscription",
  promise: "Get the refund you are owed without a phone call.",
  whoFor: "Anyone paying for something they stopped using.",
  whoNotFor: "Anyone whose contract is not theirs to end.",
  status: "published",
  previewImageUrl: "https://example.com/card.png",
};

describe("coreFieldsSchema", () => {
  it("accepts a complete set of fields", () => {
    expect(coreFieldsSchema.safeParse(CORE).success).toBe(true);
  });

  it("accepts empty optional text", () => {
    const parsed = coreFieldsSchema.safeParse({ ...CORE, whoFor: "", whoNotFor: "" });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.whoFor).toBeNull();
    }
  });

  it("refuses a title that is too short to mean anything", () => {
    expect(coreFieldsSchema.safeParse({ ...CORE, title: "ab" }).success).toBe(false);
  });

  it("refuses a promise that is not a sentence", () => {
    expect(coreFieldsSchema.safeParse({ ...CORE, promise: "Cancels." }).success).toBe(false);
  });

  it("refuses a status it does not recognise", () => {
    expect(coreFieldsSchema.safeParse({ ...CORE, status: "live" }).success).toBe(false);
  });

  it("refuses a preview image that is not a URL", () => {
    expect(
      coreFieldsSchema.safeParse({ ...CORE, previewImageUrl: "javascript:alert(1)" }).success,
    ).toBe(false);
  });

  it("treats an empty preview image as no image", () => {
    const parsed = coreFieldsSchema.safeParse({ ...CORE, previewImageUrl: "" });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.previewImageUrl).toBeNull();
    }
  });
});

describe("inputSchema", () => {
  const INPUT = { key: "provider", label: "Your provider", type: "text", required: true };

  it("accepts a well-formed input", () => {
    expect(inputSchema.safeParse(INPUT).success).toBe(true);
  });

  it("refuses a key that is not usable inside a placeholder", () => {
    expect(inputSchema.safeParse({ ...INPUT, key: "my provider" }).success).toBe(false);
  });

  it("refuses an input with no label, because a reader has to see something", () => {
    expect(inputSchema.safeParse({ ...INPUT, label: "" }).success).toBe(false);
  });

  it("refuses a type the reader's form does not have", () => {
    expect(inputSchema.safeParse({ ...INPUT, type: "colour" }).success).toBe(false);
  });
});

describe("versionContentSchema", () => {
  const VERSION = {
    playbookId: CORE.id,
    promptTemplate: "Write a cancellation notice for {{provider}}. Keep it under 100 words.",
    changelog: "Tightened the opening line.",
    inputs: [{ key: "provider", label: "Your provider", type: "text", required: true }],
    steps: [{ body: "Paste your renewal summary into the box." }],
  };

  it("accepts a complete version", () => {
    expect(versionContentSchema.safeParse(VERSION).success).toBe(true);
  });

  it("refuses a version with no changelog, which is the requirement", () => {
    expect(versionContentSchema.safeParse({ ...VERSION, changelog: "" }).success).toBe(false);
  });

  it("refuses a one-word changelog", () => {
    expect(versionContentSchema.safeParse({ ...VERSION, changelog: "typo" }).success).toBe(false);
  });

  it("refuses a prompt too short to be a prompt", () => {
    expect(
      versionContentSchema.safeParse({ ...VERSION, promptTemplate: "help" }).success,
    ).toBe(false);
  });

  it("refuses more inputs than a playbook can ask for", () => {
    const many = Array.from({ length: 13 }, (_, index) => ({
      key: `field_${index}`,
      label: `Field ${index}`,
      type: "text",
      required: false,
    }));

    expect(versionContentSchema.safeParse({ ...VERSION, inputs: many }).success).toBe(false);
  });

  it("refuses more steps than the reader's page has room for", () => {
    const steps = Array.from({ length: 11 }, () => ({ body: "Do the thing." }));

    expect(versionContentSchema.safeParse({ ...VERSION, steps }).success).toBe(false);
  });
});

describe("validateContent", () => {
  it("accepts a prompt that uses one of its inputs", () => {
    const result = validateContent({
      promptTemplate: "Write a notice for {{provider}}.",
      inputs: [{ key: "provider", label: "Your provider", required: true }],
    });

    expect(result.ok).toBe(true);
  });

  it("refuses three required inputs", () => {
    const result = validateContent({
      promptTemplate: "A prompt with nothing in it.",
      inputs: [
        { key: "a", label: "A", required: true },
        { key: "b", label: "B", required: true },
        { key: "c", label: "C", required: true },
      ],
    });

    expect(result).toMatchObject({ ok: false });
    if (!result.ok) {
      expect(result.error).toContain("3");
    }
  });

  it("allows two, because two is the limit rather than a round number", () => {
    const result = validateContent({
      promptTemplate: "Notice for {{a}} and {{b}}.",
      inputs: [
        { key: "a", label: "A", required: true },
        { key: "b", label: "B", required: true },
      ],
    });

    expect(result.ok).toBe(true);
  });

  it("counts only required inputs towards the limit", () => {
    const result = validateContent({
      promptTemplate: "Notice for {{a}}.",
      inputs: [
        { key: "a", label: "A", required: true },
        { key: "b", label: "B", required: false },
        { key: "c", label: "C", required: false },
      ],
    });

    expect(result.ok).toBe(true);
  });

  it("refuses a placeholder with no input, naming the reader's label", () => {
    const result = validateContent({
      promptTemplate: "Notice for {{ghost}}.",
      inputs: [],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("ghost");
    }
  });

  it("warns about an unused input without refusing", () => {
    const result = validateContent({
      promptTemplate: "Notice for {{a}}.",
      inputs: [
        { key: "a", label: "A", required: false },
        { key: "b", label: "B", required: false },
      ],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain("B");
    }
  });

  it("says nothing at all about a version with no inputs and no placeholders", () => {
    const result = validateContent({ promptTemplate: "A prompt with nothing to fill in.", inputs: [] });

    expect(result).toEqual({ ok: true, warnings: [] });
  });
});