import { describe, expect, it } from "vitest";

import { NEW_ACCOUNT_DAYS, SUCCESS_VALUE, TRUST_MULTIPLIERS } from "@/config/ranking";
import { decay, daysBetween, reportWeight, successValue, weightedReport } from "@/lib/ranking/weight";
import { NOW, daysAgo, playbook, report, reporter } from "@/lib/ranking/fixtures";

describe("decay", () => {
  it("is 1 for something filed today", () => {
    expect(decay(0)).toBe(1);
  });

  it("is exactly half at one half-life, and the half-life is 60 days", () => {
    // The brief's number, asserted rather than assumed: a half-life quietly
    // changed to 90 would make every ranking rule quietly wrong.
    expect(decay(60)).toBeCloseTo(0.5, 10);
    expect(decay(90)).toBeCloseTo(0.5 ** 1.5, 10);
  });

  it("is a sixteenth after a year, because a year is six half-lives", () => {
    // 365 / 60 = 6.08 half-lives. Not a round fraction, and the test says so
    // rather than asserting a memorable number the curve does not produce.
    expect(decay(365)).toBeCloseTo(0.5 ** (365 / 60), 10);
    expect(decay(180)).toBeCloseTo(0.125, 10);
  });

  it("is zero at infinity and one at negative infinity, never above one", () => {
    // A future timestamp must not be worth *more* than a report filed now.
    // `0.5 ** -1` is 2, so this is a real guard and not a formality.
    expect(decay(-10)).toBe(1);
    // A broken date gets no influence rather than all of it: a row whose
    // `created_at` did not parse must not be the most persuasive thing here.
    expect(decay(Number.POSITIVE_INFINITY)).toBe(0);
    expect(decay(Number.NaN)).toBe(0);
  });

  it("returns 1 rather than dividing by zero when the half-life is zero", () => {
    expect(decay(10, 0)).toBe(1);
  });
});

describe("successValue", () => {
  it("scores worked 1, partly 0.5 and didn't 0", () => {
    expect(successValue("worked")).toBe(1);
    expect(successValue("partly")).toBe(0.5);
    expect(successValue("didnt")).toBe(0);
  });

  it("keeps partly strictly above didn't", () => {
    // If these were equal, "partly" and "didn't" would be the same answer and
    // the whole three-way bar would be two-way.
    expect(SUCCESS_VALUE.partly).toBeGreaterThan(SUCCESS_VALUE.didnt);
  });
});

describe("reportWeight", () => {
  const authorless = playbook({ authorId: null });

  it("is 1.0 for an ordinary report", () => {
    expect(
      reportWeight(report(), authorless, reporter("reader-1")),
    ).toBe(1);
  });

  it("is zero for a rejected report", () => {
    expect(reportWeight(report({ status: "rejected" }), authorless, reporter("r"))).toBe(0);
  });

  it("is zero for an outlier", () => {
    expect(reportWeight(report({ isOutlier: true }), authorless, reporter("r"))).toBe(0);
  });

  it("is zero for the playbook author's own report", () => {
    // The rule that matters most in practice: an author filing twenty
    // "it worked" reports has an evidence score of 1.0 and no evidence at all.
    const owned = playbook({ authorId: "author-1" });
    expect(reportWeight(report(), owned, reporter("author-1"))).toBe(0);
  });

  it("does not confuse a null author with a matching one", () => {
    // A catalogue entry nobody has claimed must not make every reporter an
    // author, which a `playbook.authorId === reporter.id` check with a
    // null-coalescing bug would happily do.
    expect(reportWeight(report(), playbook({ authorId: null }), reporter("reader-1"))).toBe(1);
  });

  it("halves for an unverified email", () => {
    const weight = reportWeight(report(), authorless, reporter("r", { emailVerified: false }));
    expect(weight).toBe(TRUST_MULTIPLIERS.unverifiedEmail);
  });

  it("multiplies by 1.5 for approved evidence", () => {
    const withEvidence = reportWeight(
      report({ hasApprovedEvidence: true }),
      authorless,
      reporter("r"),
    );
    const without = reportWeight(report(), authorless, reporter("r"));
    expect(withEvidence).toBeCloseTo(without * TRUST_MULTIPLIERS.approvedEvidence, 10);
  });

  it("halves for an account younger than a day", () => {
    const fresh = reporter("r", { createdAt: daysAgo(NEW_ACCOUNT_DAYS - 0.25) });
    const weight = reportWeight(report(), authorless, fresh);
    expect(weight).toBe(TRUST_MULTIPLIERS.newAccount);
  });

  it("does not halve for an account exactly a day old", () => {
    // `<` and `<=` is a boundary, and a boundary is a test. The report is
    // filed today so the only thing being measured is the account's age.
    const boundary = reporter("r", { createdAt: daysAgo(NEW_ACCOUNT_DAYS) });
    expect(reportWeight(report({ createdAt: daysAgo(0) }), authorless, boundary)).toBe(1);
  });

  it("measures account age at filing, not at scoring time", () => {
    // A report filed today by a two-year-old account is not a new-account
    // report, however old that account is when the nightly job re-runs it.
    const oldAccount = reporter("r", { createdAt: daysAgo(730) });
    const filedLate = report({ createdAt: daysAgo(0) });

    expect(reportWeight(filedLate, authorless, oldAccount)).toBe(1);
  });

  it("stacks the multipliers rather than taking the harshest", () => {
    // Unverified *and* new *and* no evidence: 0.5 × 0.5, not 0.5.
    const stacked = reportWeight(
      report(),
      authorless,
      reporter("r", { emailVerified: false, createdAt: daysAgo(0) }),
    );
    expect(stacked).toBeCloseTo(0.25, 10);
  });
});

describe("weightedReport", () => {
  const authorless = playbook({ authorId: null });

  it("multiplies trust by decay", () => {
    const aged = weightedReport(report({ createdAt: daysAgo(60) }), authorless, reporter("r"), NOW);
    expect(aged).toBeCloseTo(0.5, 10);
  });

  it("is zero when the trust is zero, whatever the age", () => {
    expect(
      weightedReport(report({ isOutlier: true, createdAt: daysAgo(0) }), authorless, reporter("r"), NOW),
    ).toBe(0);
  });
});

describe("daysBetween", () => {
  it("counts whole and fractional days", () => {
    expect(daysBetween(new Date(NOW.getTime() - 2 * 86_400_000), NOW)).toBe(2);
    expect(daysBetween(new Date(NOW.getTime() - 36_000_000), NOW)).toBeCloseTo(0.4167, 3);
  });

  it("never returns a negative number for a reversed pair", () => {
    expect(daysBetween(NOW, new Date(NOW.getTime() - 86_400_000))).toBe(0);
  });

  it("is null when either end is missing", () => {
    expect(daysBetween(null, NOW)).toBeNull();
    expect(daysBetween(NOW, null)).toBeNull();
  });
});