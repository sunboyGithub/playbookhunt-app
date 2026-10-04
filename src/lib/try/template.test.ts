import { describe, expect, it } from "vitest";

import { renderTemplate, templateKeys } from "./template";

const INPUTS = [
  { key: "provider", label: "Provider" },
  { key: "price", label: "Monthly price" },
  { key: "zip", label: "ZIP code" },
  { key: "bill", label: "Your latest bill" },
];

describe("renderTemplate", () => {
  it("substitutes a value that was supplied", () => {
    const { text } = renderTemplate("My provider is {{provider}}.", INPUTS, { provider: "Xfinity" });

    expect(text).toBe("My provider is Xfinity.");
  });

  it("shows the label in brackets when a value is missing", () => {
    const { text } = renderTemplate("My provider is {{provider}}.", INPUTS, {});

    // The label, not the key: a reader needs to know which field to go and fill.
    expect(text).toBe("My provider is [Provider].");
  });

  it("reports every unfilled key, deduplicated and in first-appearance order", () => {
    const { unfilled } = renderTemplate(
      "{{provider}} costs {{price}} in {{zip}} for {{provider}}",
      INPUTS,
      {},
    );

    // `provider` appears twice in the template but is one field to fill.
    expect(unfilled).toEqual(["provider", "price", "zip"]);
  });

  it("does not report a key that had a value as unfilled", () => {
    const { unfilled } = renderTemplate("{{provider}} {{price}}", INPUTS, { provider: "Cox" });

    expect(unfilled).toEqual(["price"]);
  });

  it("treats a whitespace-only value as unfilled", () => {
    const { text, unfilled } = renderTemplate("{{price}}", INPUTS, { price: "   " });

    // A reader who typed a space has not answered the question, and rendering a
    // bare space into a prompt looks like a bug rather than an empty field.
    expect(text).toBe("[Monthly price]");
    expect(unfilled).toEqual(["price"]);
  });

  it("trims surrounding whitespace from a value", () => {
    const { text } = renderTemplate("[{{provider}}]", INPUTS, { provider: "  Verizon  " });

    expect(text).toBe("[Verizon]");
  });

  it("inserts special characters verbatim", () => {
    const bill = 'Acme "Internet"\n  $99.00 <bill> & co — 100% {done}';

    const { text } = renderTemplate("Bill: {{bill}}", INPUTS, { bill });

    // A prompt is text for a model, not markup. Escaping here would put
    // backslashes into somebody's prompt.
    expect(text).toBe(`Bill: ${bill}`);
  });

  it("does not re-substitute a token that came from a value", () => {
    const { text } = renderTemplate("{{bill}} costs {{price}}", INPUTS, {
      bill: "the line item is {{price}}",
      price: "$99",
    });

    // A single pass. The template's own `{{price}}` is substituted; the copy the
    // pasted bill text happens to contain is left exactly as the reader typed
    // it. Sequential replacement would have turned it into "$99", corrupting the
    // pasted bill.
    expect(text).toBe("the line item is {{price}} costs $99");
  });

  it("tolerates whitespace inside the braces", () => {
    const { text } = renderTemplate("{{ provider }} / {{price}}", INPUTS, { provider: "AT&T" });

    expect(text).toBe("AT&T / [Monthly price]");
  });

  it("shows the raw key when the template references an input that does not exist", () => {
    const { text, unfilled } = renderTemplate("{{policy}}", INPUTS, {});

    // No label to show, so the key names the gap rather than `[undefined]`.
    expect(text).toBe("[policy]");
    expect(unfilled).toEqual(["policy"]);
  });

  it("leaves a template with no placeholders untouched", () => {
    const template = "You are helping me lower my home internet bill.";

    const { text, unfilled } = renderTemplate(template, INPUTS, {});

    expect(text).toBe(template);
    expect(unfilled).toEqual([]);
  });

  it("renders a long prompt without truncating it", () => {
    const template = Array.from({ length: 500 }, (_, index) => `Step ${index}: {{provider}}`).join(
      "\n",
    );

    const { text } = renderTemplate(template, INPUTS, { provider: "T-Mobile" });

    // Each `{{provider}}` (12 characters) becomes "T-Mobile" (8), so the
    // rendered prompt is exactly 4 characters shorter per occurrence.
    expect(text).toHaveLength(template.length - 500 * ("{{provider}}".length - "T-Mobile".length));
    expect(text.split("\n")).toHaveLength(500);
    expect(text).not.toContain("{{");
  });

  it("never leaves a token in the output", () => {
    const { text } = renderTemplate("{{provider}} {{price}} {{zip}} {{bill}}", INPUTS, {
      provider: "Cox",
    });

    expect(text).not.toMatch(/\{\{/);
  });
});

describe("templateKeys", () => {
  it("lists referenced keys once, in order", () => {
    expect(templateKeys("{{zip}} {{provider}} {{zip}}")).toEqual(["zip", "provider"]);
  });

  it("returns an empty list for a template with no placeholders", () => {
    expect(templateKeys("No tokens here.")).toEqual([]);
  });

  it("sees a key that has no matching input, so authoring can flag it", () => {
    // The gap this catches: a `{{key}}` in a template with no input behind it
    // renders to a reader as `[key]` with nothing they can do about it.
    expect(templateKeys("{{provider}} {{typo}}")).toEqual(["provider", "typo"]);
  });
});