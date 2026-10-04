import { describe, expect, it } from "vitest";

import {
  AMOUNT_THRESHOLD,
  REPORT_THRESHOLD,
  last30Line,
  medianTile,
  triedTile,
  workedBreakdown,
  workedTile,
  type DetailStats,
} from "@/lib/stats/detail";

/** A well-reported playbook, so each test can drop exactly one thing. */
function stats(overrides: Partial<DetailStats> = {}): DetailStats {
  return {
    tried_count: 1247,
    report_count: 100,
    worked: 68,
    partly: 20,
    didnt: 12,
    success_rate_raw: 0.68,
    amount_n: 90,
    median_amount: 18,
    last30_success: 0.71,
    outcome_type: "money_monthly",
    outcome_unit: "$/mo",
    ...overrides,
  };
}

describe("thresholds", () => {
  it("uses the thresholds the rest of the app uses", () => {
    // Duplicated deliberately: if a number moves in types.ts without a matching
    // decision here, this fails.
    expect(REPORT_THRESHOLD).toBe(20);
    expect(AMOUNT_THRESHOLD).toBe(10);
  });
});

describe("triedTile", () => {
  it("shows a count of zero rather than nothing", () => {
    // Zero is a fact about this playbook. Hiding the tile would make a brand
    // new playbook and a broken stats row look identical.
    expect(triedTile(stats({ tried_count: 0 })).value).toBe("0");
  });

  it("singularises one", () => {
    expect(triedTile(stats({ tried_count: 1 })).caption).toBe("person tried this");
  });

  it("formats thousands", () => {
    expect(triedTile(stats()).value).toBe("1,247");
  });

  it("has no threshold", () => {
    // Deliberate, and worth pinning: every other figure on this page has one.
    expect(triedTile(stats({ tried_count: 3, report_count: 3 })).value).toBe("3");
  });
});

describe("workedTile", () => {
  it("shows a percentage at exactly the threshold", () => {
    const tile = workedTile(stats({ report_count: 20, success_rate_raw: 0.68 }));
    expect(tile.kind).toBe("rate");
  });

  it("refuses a percentage one report below the threshold", () => {
    const tile = workedTile(stats({ report_count: 19, success_rate_raw: 0.95 }));
    expect(tile.kind).toBe("early");
  });

  it("carries the denominator with the percentage", () => {
    expect(workedTile(stats({ report_count: 412 }))).toMatchObject({
      kind: "rate",
      percent: 68,
      caption: "n = 412 reports",
    });
  });

  it("says Early · 0 reports rather than showing an empty caption", () => {
    expect(workedTile(stats({ report_count: 0, success_rate_raw: null }))).toMatchObject({
      kind: "early",
      reports: 0,
      caption: "Early · 0 reports",
    });
  });

  it("falls back to Early when the rate is missing despite enough reports", () => {
    // Enough reports for a rate but no aggregated rate: the P9 job has not run.
    // Showing the count understates; inventing the rate states something
    // unmeasured.
    expect(workedTile(stats({ report_count: 50, success_rate_raw: null })).kind).toBe("early");
  });

  it("reads a rate stored as a string", () => {
    expect(workedTile(stats({ success_rate_raw: "0.4" }))).toMatchObject({
      kind: "rate",
      percent: 40,
    });
  });
});

describe("medianTile", () => {
  it("hides below the amount threshold", () => {
    expect(medianTile(stats({ amount_n: 9, median_amount: 18 })).kind).toBe("hidden");
  });

  it("shows at exactly the threshold", () => {
    expect(medianTile(stats({ amount_n: 10, median_amount: 18 })).kind).toBe("value");
  });

  it("hides when there is no median at all", () => {
    expect(medianTile(stats({ amount_n: 90, median_amount: null })).kind).toBe("hidden");
  });

  it("uses the monthly suffix from the playbook's own outcome type", () => {
    expect(medianTile(stats()).text).toBe("$18/mo");
    expect(medianTile(stats({ outcome_type: "money_yearly" })).text).toBe("$18/yr");
    expect(medianTile(stats({ outcome_type: "money_once" })).text).toBe("$18");
  });

  it("reads hours for a time outcome", () => {
    expect(medianTile(stats({ outcome_type: "time_hours", median_amount: 3 })).text).toBe("3 hrs saved");
    expect(medianTile(stats({ outcome_type: "time_hours", median_amount: 1 })).text).toBe("1 hr saved");
  });

  it("reports how many amounts the median rests on", () => {
    expect(medianTile(stats({ amount_n: 90 })).caption).toBe("n = 90 with amounts");
  });
});

describe("workedBreakdown", () => {
  it("is empty with no reports at all", () => {
    expect(workedBreakdown(stats({ report_count: 0, worked: 0, partly: 0, didnt: 0 }))).toEqual({
      kind: "empty",
      message: "No reports yet — be the first",
    });
  });

  it("is empty below the threshold but says so with the count", () => {
    const bar = workedBreakdown(stats({ report_count: 6, worked: 4, partly: 1, didnt: 1 }));
    expect(bar).toEqual({ kind: "empty", message: "Not enough reports yet — 6 so far" });
  });

  it("renders the bar at exactly the threshold", () => {
    expect(workedBreakdown(stats({ report_count: 20 })).kind).toBe("bar");
  });

  it("fills the bar exactly even when each share rounds badly", () => {
    // 1/3 each. The *labels* round to 33 + 33 + 33 = 99 and that is fine and
    // honest; the *widths* are exact thirds and must total 100 or the bar
    // renders with a gap in it.
    const bar = workedBreakdown(stats({ report_count: 100, worked: 1, partly: 1, didnt: 1 }));
    expect(bar.kind).toBe("bar");
    if (bar.kind !== "bar") return;
    const totalWidth = bar.segments.reduce((sum, segment) => sum + segment.width, 0);
    expect(totalWidth).toBeCloseTo(100, 6);
  });

  it("labels each segment as its share of all reports", () => {
    // 8/21, 7/21, 6/21 → 38%, 33%, 29% of the 21 reports. The labels do not
    // have to total 100; forcing them to would mean inventing a number.
    const bar = workedBreakdown(stats({ report_count: 21, worked: 8, partly: 7, didnt: 6 }));
    if (bar.kind !== "bar") throw new Error("expected a bar at 21 reports");
    expect(bar.segments.map((segment) => segment.percent)).toEqual([38, 33, 29]);
  });

  it("shares the report count, not the segment sum, when they disagree", () => {
    // 150 reports but only 100 classified: the other 50 were rejected or
    // flagged outliers. Worked is 50 of 150, a third — not half. Dividing by the
    // segment sum would print "50% worked" on a playbook where a third of every
    // report a person filed counted against it.
    const bar = workedBreakdown(stats({ report_count: 150, worked: 50, partly: 25, didnt: 25 }));
    if (bar.kind !== "bar") throw new Error("expected a bar");
    expect(bar.segments.map((segment) => segment.percent)).toEqual([33, 17, 17]);
    // …while the geometry still fills the track, which is what makes the bar
    // look right rather than half-empty.
    expect(bar.segments.map((segment) => Math.round(segment.width))).toEqual([50, 25, 25]);
  });

  it("does not divide by zero when every report is excluded", () => {
    const bar = workedBreakdown(stats({ report_count: 50, worked: 0, partly: 0, didnt: 0 }));
    if (bar.kind !== "bar") throw new Error("expected a bar");
    expect(bar.segments.every((segment) => Number.isFinite(segment.width))).toBe(true);
    expect(bar.segments.reduce((sum, segment) => sum + segment.width, 0)).toBe(0);
  });

  it("carries the counts as well as the percentages", () => {
    const bar = workedBreakdown(stats({ report_count: 100, worked: 68, partly: 20, didnt: 12 }));
    if (bar.kind !== "bar") throw new Error("expected a bar");
    expect(bar.segments.map((segment) => segment.count)).toEqual([68, 20, 12]);
  });

  it("writes a text alternative that names every segment", () => {
    const bar = workedBreakdown(stats({ report_count: 100, worked: 68, partly: 20, didnt: 12 }));
    if (bar.kind !== "bar") throw new Error("expected a bar");
    // The bar conveys its information through width and colour alone, so this
    // sentence is the only version a screen reader gets.
    expect(bar.altText).toBe("68% Worked (68 reports), 20% Partly worked (20 reports), 12% Didn't work (12 reports)");
  });
});

describe("last30Line", () => {
  it("is hidden below the threshold", () => {
    // The whole reason the count is passed in: a 30-day rate computed from
    // three reports is not a 30-day rate.
    expect(last30Line(stats(), 19)).toBeNull();
  });

  it("shows at the threshold", () => {
    expect(last30Line(stats(), 20)).toMatchObject({ percent: 71 });
  });

  it("reads last30_success and never the all-time rate", () => {
    // success_rate_raw is 0.68 here and last30_success is 0.71. Rendering the
    // all-time figure under a "Last 30 days" label produces a page whose halves
    // each look right and whose labels disagree.
    expect(last30Line(stats({ success_rate_raw: 0.1, last30_success: 0.71 }), 20)?.percent).toBe(71);
  });

  it("is hidden when the 30-day rate has not been aggregated", () => {
    expect(last30Line(stats({ last30_success: null }), 40)).toBeNull();
  });

  it("reports the count it was given, not the all-time count", () => {
    expect(last30Line(stats(), 24)?.caption).toBe("Last 30 days · n = 24 reports");
  });
});