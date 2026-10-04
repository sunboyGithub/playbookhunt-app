import { describe, expect, it } from "vitest";

import { amountCap, reportSchema } from "@/lib/report/schema";
import { AMOUNT_CAPS } from "@/lib/report/shape";

/**
 * The schema is the last thing a reader's words pass through before they become
 * a published number, so the cases here are the ones where being wrong is
 * expensive: an unbounded note is an unbounded thing to publish, `Infinity`
 * poisons every median computed over the column, and a cap applied as a
 * validation error makes people report a smaller number than the truth.
 */

const playbookId = "0f8fad5b-d9cb-469f-a165-70867728950e";
const versionId = "1f8fad5b-d9cb-469f-a165-70867728950e";

const base = { playbookId, versionId, result: "worked" };

const file = (bytes: number, type = "image/png") =>
  new File([new Uint8Array(bytes)], "shot.png", { type });

describe("required fields", () => {
  it("accepts a report with nothing but a result", () => {
    // The brief's central instruction: only "Did it work?" is required.
    const parsed = reportSchema("money_monthly").safeParse(base);
    expect(parsed.success).toBe(true);
  });

  it("refuses a report with no result, and says which button to press", () => {
    const parsed = reportSchema("money_monthly").safeParse({ playbookId, versionId });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.message).toMatch(/worked, partly, or didn't/);
    }
  });

  it("refuses a result that is not one of the three", () => {
    const parsed = reportSchema("money_monthly").safeParse({ ...base, result: "amazing" });
    expect(parsed.success).toBe(false);
  });

  it("requires a uuid playbook and version", () => {
    expect(reportSchema("money_monthly").safeParse({ ...base, playbookId: "1" }).success).toBe(false);
    expect(reportSchema("money_monthly").safeParse({ ...base, versionId: "x" }).success).toBe(false);
  });
});

describe("amount", () => {
  it("accepts a number above the cap and normalises it — the cap is not a limit", () => {
    // 5,000/mo is the cap. Someone who saved 12,000 is not making a typo about
    // an internet bill, and telling them it is invalid is how you get a report
    // of $200 that neither of them believes. The action flags it instead.
    const parsed = reportSchema("money_monthly").safeParse({ ...base, amount: 12_000 });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.amount).toBe(12_000);
  });

  it("treats an empty string as no amount rather than as zero", () => {
    const parsed = reportSchema("money_monthly").safeParse({ ...base, amount: "" });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.amount).toBeNull();
  });

  it("refuses zero, negatives and nonsense", () => {
    for (const amount of ["0", -5, "abc"]) {
      expect(reportSchema("money_monthly").safeParse({ ...base, amount }).success).toBe(false);
    }
  });

  it("refuses Infinity and NaN, which a naive > 0 check lets through", () => {
    // Both reach Postgres as `Infinity`, and a single one poisons every median
    // computed over the column from then on.
    expect(reportSchema("money_monthly").safeParse({ ...base, amount: Infinity }).success).toBe(false);
    expect(reportSchema("money_monthly").safeParse({ ...base, amount: NaN }).success).toBe(false);
    expect(reportSchema("money_monthly").safeParse({ ...base, amount: "Infinity" }).success).toBe(
      false,
    );
  });

  it("coerces a numeric string, because the form sends one", () => {
    const parsed = reportSchema("money_monthly").safeParse({ ...base, amount: "18.50" });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.amount).toBe(18.5);
  });

  it("reads hours into hours_saved for a time playbook, not into amount", () => {
    const parsed = reportSchema("time_hours").safeParse({ ...base, hoursSaved: "3" });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.hoursSaved).toBe(3);
      expect(parsed.data.amount).toBeNull();
    }
  });

  it("ignores an amount offered to a playbook that collects none", () => {
    const parsed = reportSchema("binary").safeParse({ ...base, amount: "50" });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.amount).toBeNull();
  });

  it("ignores hours offered to a money playbook rather than refusing the report", () => {
    // The form keeps one field and sends it under both keys, because it renders
    // either the money or the hours input from the same state. A schema that
    // demanded `null` here rejected every report on a money playbook — the field
    // the reader filled in was fine, the key it also arrived under was not.
    const parsed = reportSchema("money_monthly").safeParse({
      ...base,
      amount: "83",
      hoursSaved: "83",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.amount).toBe(83);
      expect(parsed.data.hoursSaved).toBeNull();
    }
  });

  it("ignores an amount offered to a playbook that only collects hours", () => {
    // The mirror of the case above, and the reason the rule is symmetric: the
    // same form sends `amount` on a time playbook too.
    const parsed = reportSchema("time_hours").safeParse({ ...base, amount: "3", hoursSaved: "3" });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.hoursSaved).toBe(3);
      expect(parsed.data.amount).toBeNull();
    }
  });
});

describe("note", () => {
  it("trims and caps at 500 characters", () => {
    const long = "x".repeat(600);
    const parsed = reportSchema("money_monthly").safeParse({ ...base, note: `  ${long}  ` });
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.issues[0]?.message).toMatch(/500/);
  });

  it("stores an empty note as null", () => {
    const parsed = reportSchema("money_monthly").safeParse({ ...base, note: "   " });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.note).toBeNull();
  });

  it("keeps a note exactly at the limit", () => {
    const parsed = reportSchema("money_monthly").safeParse({ ...base, note: "y".repeat(500) });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.note).toHaveLength(500);
  });
});

describe("referral code", () => {
  it("upper-cases and accepts six alphanumerics", () => {
    const parsed = reportSchema("money_monthly").safeParse({ ...base, referralCode: "gt09wc" });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.referralCode).toBe("GT09WC");
  });

  it("refuses a code of the wrong length", () => {
    expect(reportSchema("money_monthly").safeParse({ ...base, referralCode: "GT09" }).success).toBe(
      false,
    );
  });
});

describe("provider and region", () => {
  const providers = ["Xfinity", "Spectrum", "AT&T"];

  it("accepts a listed option", () => {
    const parsed = reportSchema("money_monthly", providers).safeParse({
      ...base,
      provider: "Spectrum",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.provider).toBe("Spectrum");
  });

  it("refuses an option that is not on the list", () => {
    // This is what stops a provider filter growing a "Zzzcorp" bucket because
    // somebody typed a company the playbook never listed.
    expect(
      reportSchema("money_monthly", providers).safeParse({ ...base, provider: "Zzzcorp" }).success,
    ).toBe(false);
  });

  it("still allows nothing at all", () => {
    const parsed = reportSchema("money_monthly", providers).safeParse({ ...base, provider: null });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.provider).toBeNull();
  });

  it("accepts any short string when the playbook declares no options", () => {
    const parsed = reportSchema("money_monthly").safeParse({ ...base, region: "Yorkshire" });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.region).toBe("Yorkshire");
  });
});

describe("agent", () => {
  it("defaults to the first configured agent, never to raw text", () => {
    const parsed = reportSchema("money_monthly").safeParse(base);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.agentSlug).toBe("muse");
  });

  it("refuses a slug that is not one", () => {
    expect(
      reportSchema("money_monthly").safeParse({ ...base, agentSlug: "../../etc/passwd" }).success,
    ).toBe(false);
  });
});

describe("evidence", () => {
  it("requires the redaction confirmation when a file is attached", () => {
    const parsed = reportSchema("money_monthly").safeParse({ ...base, evidence: file(1000) });
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.issues[0]?.path).toEqual(["evidenceRedacted"]);
  });

  it("refuses the confirmation when there is no file", () => {
    // Otherwise the stored report would claim a redaction happened for a
    // screenshot that does not exist.
    const parsed = reportSchema("money_monthly").safeParse({ ...base, evidenceRedacted: true });
    expect(parsed.success).toBe(false);
  });

  it("accepts a file with the confirmation", () => {
    const parsed = reportSchema("money_monthly").safeParse({
      ...base,
      evidence: file(1000),
      evidenceRedacted: true,
    });
    expect(parsed.success).toBe(true);
  });

  it("refuses a file over 5MB", () => {
    const parsed = reportSchema("money_monthly").safeParse({
      ...base,
      evidence: file(5 * 1024 * 1024 + 1),
      evidenceRedacted: true,
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.issues[0]?.message).toMatch(/5MB/);
  });

  it("treats an empty File as no file", () => {
    // A browser can hand back a zero-byte File when a picker is dismissed on
    // some platforms; it must not trip the redaction rule.
    const parsed = reportSchema("money_monthly").safeParse({ ...base, evidence: file(0) });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.evidence).toBeNull();
  });
});

describe("amountCap", () => {
  it("matches AMOUNT_CAPS for each outcome type, and zero for none", () => {
    for (const [type, cap] of Object.entries(AMOUNT_CAPS)) {
      expect(amountCap(type as keyof typeof AMOUNT_CAPS)).toBe(cap);
    }
    expect(amountCap(null)).toBe(0);
  });
});