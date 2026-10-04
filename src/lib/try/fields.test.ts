import { describe, expect, it } from "vitest";

import { missingRequired, toTryFields } from "./fields";

/**
 * `toTryFields` decides what a reader sees in the try form, and both of its
 * narrowing decisions are silent: a type that falls back to `text` looks exactly
 * like a deliberate `text`, and options that come back empty look like an author
 * who wrote no options. So the fallbacks are asserted here rather than trusted.
 */

function raw(overrides: Partial<Parameters<typeof toTryFields>[0][number]> = {}) {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    key: "provider",
    label: "Provider",
    help: null,
    why_it_helps: null,
    type: "text",
    options: null,
    required: true,
    ...overrides,
  };
}

describe("toTryFields", () => {
  it("keeps a known type", () => {
    expect(toTryFields([raw({ type: "provider_picker" })])[0]?.type).toBe("provider_picker");
  });

  it("falls back to text for a type the form does not know", () => {
    // The column is `text` with a check constraint, so an unrecognised value can
    // only come from a hand-edited row or a schema that moved ahead of this
    // component. Either way the reader gets a usable field instead of a form
    // that throws.
    expect(toTryFields([raw({ type: "colour_picker" })])[0]?.type).toBe("text");
  });

  it("keeps a string array of options", () => {
    const [field] = toTryFields([raw({ type: "select", options: ["Xfinity", "Cox"] })]);

    expect(field?.options).toEqual(["Xfinity", "Cox"]);
  });

  it("treats a non-array options value as no options declared", () => {
    // `null` rather than `[]`: a value that is not a list is an author who did
    // not declare options, which is a different fact from an author who declared
    // an empty list, and the field renders an explanation for the first.
    expect(toTryFields([raw({ type: "select", options: "Xfinity" })])[0]?.options).toBeNull();
    expect(toTryFields([raw({ type: "select", options: { a: 1 } })])[0]?.options).toBeNull();
  });

  it("keeps a declared empty list as an empty list", () => {
    expect(toTryFields([raw({ type: "select", options: [] })])[0]?.options).toEqual([]);
  });

  it("drops non-string entries from an options array", () => {
    const [field] = toTryFields([raw({ type: "select", options: ["Cox", 7, null] })]);

    // Rendering a number as a button label would produce a React child error at
    // exactly the moment a reader opens the form.
    expect(field?.options).toEqual(["Cox"]);
  });

  it("prefers why_it_helps over the older help column", () => {
    const [field] = toTryFields([
      raw({ why_it_helps: "finds local offers", help: "some help" }),
    ]);

    expect(field?.why_it_helps).toBe("finds local offers");
  });

  it("falls back to help when why_it_helps is null", () => {
    const [field] = toTryFields([raw({ why_it_helps: null, help: "some help" })]);

    expect(field?.why_it_helps).toBe("some help");
  });

  it("carries every field the form needs", () => {
    const [field] = toTryFields([raw({ key: "zip", label: "ZIP code", required: false })]);

    expect(field).toMatchObject({ key: "zip", label: "ZIP code", required: false });
  });
});

describe("missingRequired", () => {
  const fields = toTryFields([
    raw({ key: "provider", label: "Provider", required: true }),
    raw({ key: "zip", label: "ZIP code", required: false }),
    raw({ key: "bill", label: "Your latest bill", required: true }),
  ]);

  it("lists the required fields with no value", () => {
    expect(missingRequired(fields, {})).toEqual(["provider", "bill"]);
  });

  it("does not list optional fields", () => {
    // The whole point of `required` being a separate list: an unfilled optional
    // is not an error and must not be reported as one.
    expect(missingRequired(fields, { provider: "Cox" })).toEqual(["bill"]);
  });

  it("treats a whitespace-only value as missing", () => {
    expect(missingRequired(fields, { provider: "Cox", bill: "   " })).toEqual(["bill"]);
  });

  it("returns nothing when every required field is filled", () => {
    expect(missingRequired(fields, { provider: "Cox", bill: "Total $99" })).toEqual([]);
  });
});