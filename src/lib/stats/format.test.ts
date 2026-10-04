import { describe, expect, it } from "vitest";

import {
  AMOUNT_THRESHOLD,
  REPORT_THRESHOLD,
  canClaimProven,
  formatCount,
  formatEvidenceHeadline,
  formatEvidenceLine,
  formatEvidenceSampleSize,
  formatHours,
  formatMedianOutcome,
  formatMoney,
  formatOutcomeLine,
  formatRelativeDate,
  formatSuccessRateFrom,
  formatVerified,
  type OutcomeStats,
} from "@/lib/stats/format";

const NOW = Date.parse("2026-10-04T12:00:00Z");

/** Stats that clear every threshold, so each test can drop exactly one thing. */
function stats(overrides: Partial<OutcomeStats> = {}): OutcomeStats {
  return {
    report_count: 412,
    tried_count: 1247,
    success_rate_raw: 0.68,
    amount_n: 412,
    median_amount: 18,
    last_verified_at: null,
    outcome_type: "money_monthly",
    outcome_unit: "$/mo",
    ...overrides,
  };
}

describe("thresholds", () => {
  it("uses the documented thresholds", () => {
    // Duplicated here on purpose. If either number moves in types.ts without a
    // deliberate change here, this fails and the change has to be a decision.
    expect(REPORT_THRESHOLD).toBe(20);
    expect(AMOUNT_THRESHOLD).toBe(10);
  });
});

describe("formatSuccessRateFrom", () => {
  it("shows a percentage at exactly the threshold", () => {
    expect(formatSuccessRateFrom(stats({ report_count: REPORT_THRESHOLD }))).toEqual({
      kind: "rate",
      percent: 68,
      n: 20,
    });
  });

  it("refuses a percentage one report below the threshold", () => {
    expect(formatSuccessRateFrom(stats({ report_count: REPORT_THRESHOLD - 1 }))).toEqual({
      kind: "early",
      reports: 19,
    });
  });

  it("rounds rather than truncating", () => {
    expect(formatSuccessRateFrom(stats({ success_rate_raw: 0.675 }))).toMatchObject({ percent: 68 });
    expect(formatSuccessRateFrom(stats({ success_rate_raw: 0.674 }))).toMatchObject({ percent: 67 });
  });

  it("reads success_rate_raw as a fraction, not a percentage", () => {
    // 0.68 is 68%. Treating it as 68 would print "6800% worked".
    expect(formatSuccessRateFrom(stats({ success_rate_raw: 0.68 }))).toMatchObject({ percent: 68 });
  });

  it("falls back to 'early' when the rate is missing despite enough reports", () => {
    // "Early" understates a well-reported playbook, but inventing a number is
    // worse. The aggregation job has not run yet.
    expect(formatSuccessRateFrom(stats({ success_rate_raw: null }))).toEqual({
      kind: "early",
      reports: 412,
    });
  });

  it("survives no stats at all", () => {
    expect(formatSuccessRateFrom(null)).toEqual({ kind: "early", reports: 0 });
  });

  it("accepts a numeric column that arrived as a string", () => {
    // Postgres numeric comes back as a string when it has trailing precision.
    expect(formatSuccessRateFrom(stats({ success_rate_raw: "0.68", report_count: "412" }))).toEqual({
      kind: "rate",
      percent: 68,
      n: 412,
    });
  });
});

describe("formatMedianOutcome", () => {
  it("returns null below the amount threshold", () => {
    expect(formatMedianOutcome(stats({ amount_n: AMOUNT_THRESHOLD - 1 }))).toBeNull();
  });

  it("returns the median at exactly the amount threshold", () => {
    expect(formatMedianOutcome(stats({ amount_n: AMOUNT_THRESHOLD }))).toBe("$18/mo");
  });

  it("uses the unit implied by outcome_type, not the playbook's unit field", () => {
    // outcome_unit is free text an author typed; outcome_type is the enum that
    // P9 aggregates on, so it is the one that decides the suffix.
    expect(formatMedianOutcome(stats({ outcome_type: "money_yearly", outcome_unit: "whatever" }))).toBe("$18/yr");
    expect(formatMedianOutcome(stats({ outcome_type: "money_once" }))).toBe("$18");
  });

  it("formats hours as saved time, with no dollar sign", () => {
    expect(formatMedianOutcome(stats({ outcome_type: "time_hours", median_amount: 3 }))).toBe("3 hrs saved");
    expect(formatMedianOutcome(stats({ outcome_type: "time_hours", median_amount: 1 }))).toBe("1 hr saved");
  });

  it("returns null when there is no median even at a high count", () => {
    expect(formatMedianOutcome(stats({ median_amount: null, amount_n: 500 }))).toBeNull();
  });

  it("returns null for no stats", () => {
    expect(formatMedianOutcome(null)).toBeNull();
  });
});

describe("formatMoney and formatHours", () => {
  it("drops cents", () => {
    expect(formatMoney(18.4)).toBe("$18");
    expect(formatMoney(18.6)).toBe("$19");
  });

  it("groups thousands", () => {
    expect(formatMoney(12400)).toBe("$12,400");
  });

  it("treats a missing amount as zero rather than NaN", () => {
    expect(formatMoney(null)).toBe("$0");
    expect(formatHours(null)).toBe("0 hrs saved");
  });

  it("pluralises one hour", () => {
    expect(formatHours(1)).toBe("1 hr saved");
    expect(formatHours(2)).toBe("2 hrs saved");
  });
});

describe("formatRelativeDate", () => {
  it("says today for anything under a day old", () => {
    expect(formatRelativeDate("2026-10-04T11:59:00Z", NOW)).toBe("today");
  });

  it("says yesterday at exactly one day", () => {
    expect(formatRelativeDate("2026-10-03T12:00:00Z", NOW)).toBe("yesterday");
  });

  it("counts days, matching the frame's 'verified 3d ago'", () => {
    expect(formatRelativeDate("2026-10-01T12:00:00Z", NOW)).toBe("3d ago");
  });

  it("does not report a negative age for a future timestamp", () => {
    // Clock skew between the writer and the reader must not produce "-2d ago".
    expect(formatRelativeDate("2026-10-09T12:00:00Z", NOW)).toBe("today");
  });

  it("returns an empty string for missing or unparseable input", () => {
    expect(formatRelativeDate(null)).toBe("");
    expect(formatRelativeDate("not a date")).toBe("");
  });

  it("keeps counting in days past a month", () => {
    // "38d ago" tells a reader more than "5w ago" when weighing evidence.
    expect(formatRelativeDate("2026-08-27T12:00:00Z", NOW)).toBe("38d ago");
  });
});

describe("formatVerified", () => {
  it("prefixes the relative date", () => {
    expect(formatVerified("2026-10-01T12:00:00Z", NOW)).toBe("verified 3d ago");
  });

  it("returns null when never verified, so the clause is omitted", () => {
    expect(formatVerified(null)).toBeNull();
  });
});

describe("formatEvidenceLine", () => {
  it("renders tries, rate and sample size together", () => {
    expect(formatEvidenceLine(stats())).toBe("1,247 tried · 68% worked (n=412)");
  });

  it("renders 'Early' instead of a percentage below the threshold", () => {
    expect(formatEvidenceLine(stats({ report_count: 9, success_rate_raw: 0.72 }))).toBe(
      "1,247 tried · Early · 9 reports",
    );
  });

  it("omits tries entirely when nobody has tried it", () => {
    expect(formatEvidenceLine(stats({ tried_count: 0, report_count: 0, success_rate_raw: null }))).toBe("");
  });

  it("still shows reports when the try counter is missing", () => {
    expect(formatEvidenceLine(stats({ tried_count: 0, report_count: 30, success_rate_raw: 0.5 }))).toBe(
      "50% worked (n=30)",
    );
  });

  it("returns an empty string for no stats", () => {
    expect(formatEvidenceLine(null)).toBe("");
  });
});

describe("formatOutcomeLine", () => {
  it("joins median and verified date", () => {
    expect(formatOutcomeLine(stats({ last_verified_at: "2026-10-01T12:00:00Z" }), NOW)).toBe(
      "Median $18/mo · verified 3d ago",
    );
  });

  it("drops the median below the threshold but keeps the date", () => {
    expect(formatOutcomeLine(stats({ amount_n: 4, last_verified_at: "2026-10-01T12:00:00Z" }), NOW)).toBe(
      "verified 3d ago",
    );
  });

  it("returns an empty string when neither is available", () => {
    expect(formatOutcomeLine(stats({ amount_n: 0, last_verified_at: null }))).toBe("");
  });
});

describe("canClaimProven", () => {
  it("requires both the report count and the evidence count", () => {
    expect(canClaimProven(20, 3)).toBe(true);
    expect(canClaimProven(19, 99)).toBe(false);
    expect(canClaimProven(500, 2)).toBe(false);
  });
});

describe("row-card evidence box", () => {
  it("leads with the percentage", () => {
    expect(formatEvidenceHeadline(stats())).toBe("68% worked");
    expect(formatEvidenceSampleSize(stats())).toBe("n=412");
  });

  it("shows 'Early' and no sample size below the threshold", () => {
    const low = stats({ report_count: 9, success_rate_raw: 0.72 });
    expect(formatEvidenceHeadline(low)).toBe("Early · 9 reports");
    expect(formatEvidenceSampleSize(low)).toBeNull();
  });
});

describe("formatCount", () => {
  it("groups thousands", () => {
    expect(formatCount(3210)).toBe("3,210");
    expect(formatCount(0)).toBe("0");
    expect(formatCount(null)).toBe("0");
  });
});