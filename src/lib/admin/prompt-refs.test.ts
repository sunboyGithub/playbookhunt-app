import { describe, expect, it } from "vitest";

import {
  checkPromptReferences,
  describeMissingReferences,
  referencedKeys,
} from "@/lib/admin/prompt-refs";

/**
 * The placeholder check.
 *
 * This is the difference between a working playbook and one that asks a reader to
 * paste `{{provider}}` into their agent literally. It runs in the editor while
 * you type and again on the server before a version is saved — the same function
 * both times, which is why it lives in `lib` and is pure.
 */

describe("referencedKeys", () => {
  it("finds nothing in a prompt with no placeholders", () => {
    expect(referencedKeys("Summarise this contract.")).toEqual([]);
  });

  it("finds one", () => {
    expect(referencedKeys("Write a renewal notice for {{provider}}.")).toEqual(["provider"]);
  });

  it("finds several, in the order they appear", () => {
    expect(referencedKeys("{{a}} then {{b}} then {{a}}")).toEqual(["a", "b"]);
  });

  it("tolerates whitespace inside the braces", () => {
    expect(referencedKeys("{{  provider  }}")).toEqual(["provider"]);
  });

  it("ignores braces that are not a placeholder", () => {
    expect(referencedKeys("{not_a_placeholder} and {} and {{}}")).toEqual([]);
  });

  it("keeps digits and underscores, which are legal in a key", () => {
    expect(referencedKeys("{{provider_2}}")).toEqual(["provider_2"]);
  });
});

describe("checkPromptReferences", () => {
  it("finds nothing wrong with a prompt that matches its inputs", () => {
    expect(checkPromptReferences("Notice for {{provider}}", ["provider"])).toEqual({
      unknown: [],
      unused: [],
    });
  });

  it("reports a placeholder with no input — the fatal case", () => {
    expect(checkPromptReferences("Notice for {{provider}}", []).unknown).toEqual(["provider"]);
  });

  it("reports an input the prompt never uses", () => {
    expect(checkPromptReferences("Notice for {{provider}}", ["provider", "region"]).unused).toEqual([
      "region",
    ]);
  });

  it("separates the two so one does not mask the other", () => {
    const report = checkPromptReferences("{{ghost}}", ["real"]);

    expect(report).toEqual({ unknown: ["ghost"], unused: ["real"] });
  });

  it("ignores a duplicate key in the input list when reporting unused", () => {
    expect(checkPromptReferences("{{a}}", ["a", "a"]).unused).toEqual([]);
  });
});

describe("describeMissingReferences", () => {
  const labels = new Map([
    ["provider", "Your provider"],
    ["region", "Your region"],
  ]);

  it("uses the reader-facing label rather than the key", () => {
    const report = checkPromptReferences("Notice for {{provider}}", []);
    const message = describeMissingReferences(report, labels);

    expect(message).toContain('"{{Your provider}}"');
    expect(message).not.toContain("{{provider}}");
  });

  it("falls back to the key when there is no label", () => {
    const report = checkPromptReferences("Notice for {{unlabelled}}", []);
    const message = describeMissingReferences(report, labels);

    expect(message).toContain("{{unlabelled}}");
  });

  it("says something for one missing reference and something else for several", () => {
    const one = describeMissingReferences(
      checkPromptReferences("{{ghost}}", []),
      labels,
    );
    const two = describeMissingReferences(
      checkPromptReferences("{{ghost}} {{phantom}}", []),
      labels,
    );

    expect(one).toContain("is not a user input");
    expect(two).toContain("are not user inputs");
  });

  it("mentions an unused input too, so the message is actionable either way", () => {
    const report = checkPromptReferences("{{ghost}}", ["spare"]);
    const message = describeMissingReferences(report, labels);

    expect(message).toContain("spare");
  });
});