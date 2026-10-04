import { describe, expect, it } from "vitest";

import {
  AMOUNT_CAPS,
  EVIDENCE_MIME_TYPES,
  MAX_EVIDENCE_BYTES,
  REFERRAL_CODE_PATTERN,
  RESULTS,
  amountField,
  evidenceExtension,
  evidenceKind,
  normalizeReferralCode,
  reportFieldsFrom,
} from "@/lib/report/shape";

/**
 * `report_fields` is jsonb written by the content pipeline, so every function
 * here that reads it is reading something a human typed into YAML. These are the
 * cases where that YAML is wrong or hostile.
 */

describe("amountField", () => {
  it("offers hours for a time playbook, using the playbook's own unit", () => {
    const field = amountField("time_hours", "hrs");
    expect(field).toMatchObject({ key: "hours_saved", label: "Hours saved", unit: "hrs" });
    expect(field?.prefix).toBe("");
  });

  it("offers money with a dollar prefix for each money type", () => {
    for (const type of ["money_monthly", "money_yearly", "money_once"] as const) {
      const field = amountField(type, "$/mo");
      expect(field).toMatchObject({ key: "amount", label: "Amount saved", prefix: "$" });
    }
  });

  it("offers nothing for binary or untyped playbooks", () => {
    // A binary outcome has no number, and offering an empty input that goes
    // nowhere is worse than not offering one.
    expect(amountField("binary", null)).toBeNull();
    expect(amountField(null, null)).toBeNull();
  });

  it("falls back to a usable unit when the playbook has none", () => {
    expect(amountField("time_hours", null)?.unit).toBe("hrs");
    expect(amountField("money_monthly", null)?.unit).toBe("");
  });
});

describe("AMOUNT_CAPS", () => {
  it("is zero for binary, which is what 'no field is offered' means", () => {
    expect(AMOUNT_CAPS.binary).toBe(0);
  });

  it("scales with the period a money amount covers", () => {
    expect(AMOUNT_CAPS.money_monthly).toBeLessThan(AMOUNT_CAPS.money_yearly);
  });
});

describe("reportFieldsFrom", () => {
  it("reads a select with options", () => {
    expect(
      reportFieldsFrom({ provider: { type: "select", options: ["Xfinity", "Spectrum"] } }),
    ).toEqual([
      { key: "provider", label: "Provider", type: "select", options: ["Xfinity", "Spectrum"] },
    ]);
  });

  it("drops keys that have no column to live in", () => {
    // `satisfaction_score` would need a column. Silently dropping it is the only
    // honest option: writing it to `note` would make a number look like prose.
    expect(reportFieldsFrom({ satisfaction_score: { type: "number" } })).toEqual([]);
  });

  it("drops non-string options instead of rendering them", () => {
    expect(
      reportFieldsFrom({ region: { type: "select", options: ["US", 3, null, { a: 1 }] } })[0]
        ?.options,
    ).toEqual(["US"]);
  });

  it("falls back to free text when the options list is unusable", () => {
    // A select whose every option was dropped is a control with no choices. Text
    // is worse for consistency and better for the reader.
    expect(reportFieldsFrom({ provider: { options: "Xfinity" } })[0]).toMatchObject({
      type: "text",
      options: [],
    });
    expect(reportFieldsFrom({ provider: {} })[0]).toMatchObject({ type: "text" });
  });

  it("uses an explicit label when one is given", () => {
    expect(reportFieldsFrom({ provider: { label: "Which carrier?", options: ["a"] } })[0]?.label).toBe(
      "Which carrier?",
    );
  });

  it("humanises the key otherwise", () => {
    expect(reportFieldsFrom({ region: {} })[0]?.label).toBe("Region");
  });

  it("returns a stable order regardless of how the jsonb was written", () => {
    const a = reportFieldsFrom({ region: {}, provider: {} });
    const b = reportFieldsFrom({ provider: {}, region: {} });
    expect(a).toEqual(b);
    expect(a.map((field) => field.key)).toEqual(["provider", "region"]);
  });

  it("returns nothing for values that are not objects", () => {
    expect(reportFieldsFrom(null)).toEqual([]);
    expect(reportFieldsFrom("provider")).toEqual([]);
    expect(reportFieldsFrom([{ provider: {} }])).toEqual([]);
    expect(reportFieldsFrom(undefined)).toEqual([]);
  });

  it("survives a null field spec", () => {
    expect(reportFieldsFrom({ provider: null })).toEqual([
      { key: "provider", label: "Provider", type: "text", options: [] },
    ]);
  });
});

describe("normalizeReferralCode", () => {
  it("upper-cases, strips punctuation and truncates to six", () => {
    expect(normalizeReferralCode("gt-09 wc")).toBe("GT09WC");
    expect(normalizeReferralCode("abcdefghij")).toBe("ABCDEF");
    expect(normalizeReferralCode("!!!")).toBe("");
  });

  it("agrees with the pattern the server validates against", () => {
    for (const input of ["gt09wc", "GT09WC", "a-b_c d", "123456", "!!!!!!"]) {
      const normalized = normalizeReferralCode(input);
      const matches = REFERRAL_CODE_PATTERN.test(normalized);
      expect(matches).toBe(normalized.length === 6);
    }
  });
});

describe("evidenceKind", () => {
  it("accepts every advertised type", () => {
    for (const type of EVIDENCE_MIME_TYPES) {
      expect(evidenceKind({ type, name: "file" })).not.toBeNull();
    }
  });

  it("separates PDFs from images", () => {
    expect(evidenceKind({ type: "application/pdf", name: "a" })).toBe("pdf");
    expect(evidenceKind({ type: "image/png", name: "a" })).toBe("image");
    expect(evidenceKind({ type: "image/jpeg", name: "a" })).toBe("image");
  });

  it("accepts a PDF whose type the browser failed to detect", () => {
    expect(evidenceKind({ type: "", name: "receipt.PDF" })).toBe("pdf");
  });

  it("refuses everything else, including SVG and HTML", () => {
    // SVG and HTML are the two that matter: both can carry script, and both are
    // things a person might plausibly drag in from a browser window.
    expect(evidenceKind({ type: "image/svg+xml", name: "a.svg" })).toBeNull();
    expect(evidenceKind({ type: "text/html", name: "a.html" })).toBeNull();
    expect(evidenceKind({ type: "", name: "a.svg" })).toBeNull();
    expect(evidenceKind({ type: "application/zip", name: "a.zip" })).toBeNull();
  });
});

describe("evidenceExtension", () => {
  it("maps to a short extension, never the reader's filename", () => {
    expect(evidenceExtension("pdf", "application/pdf")).toBe("pdf");
    expect(evidenceExtension("image", "image/png")).toBe("png");
    expect(evidenceExtension("image", "image/webp")).toBe("webp");
    expect(evidenceExtension("image", "image/jpeg")).toBe("jpg");
  });
});

describe("MAX_EVIDENCE_BYTES", () => {
  it("is 5MB, below the bucket's 10MB", () => {
    expect(MAX_EVIDENCE_BYTES).toBe(5 * 1024 * 1024);
  });
});

describe("RESULTS", () => {
  it("offers exactly the three answers the ranking is defined over", () => {
    // AGENTS.md's success value is worked=1, partly=0.5, didn't=0. A fourth
    // option here would be a value the ranking has no way to score.
    expect(RESULTS.map((result) => result.value)).toEqual(["worked", "partly", "didnt"]);
  });
});