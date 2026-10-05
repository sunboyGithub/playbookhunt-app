import { describe, expect, it } from "vitest";

import { TRENDING_REPORT_WEIGHT, TRENDING_TRY_WEIGHT } from "@/config/ranking";
import { trendingScore } from "@/lib/ranking/trending";
import { NOW, daysAgo } from "@/lib/ranking/fixtures";

const HOUR = 60 * 60 * 1000;

function hoursAgo(hours: number): string {
  return new Date(NOW.getTime() - hours * HOUR).toISOString();
}

describe("trendingScore", () => {
  it("is 0 with no events", () => {
    expect(trendingScore([], NOW)).toBe(0);
  });

  it("weights a try at 1 and a report at 3", () => {
    expect(trendingScore([{ kind: "try", at: NOW }], NOW)).toBeCloseTo(TRENDING_TRY_WEIGHT, 10);
    expect(trendingScore([{ kind: "report", at: NOW }], NOW)).toBeCloseTo(
      TRENDING_REPORT_WEIGHT,
      10,
    );
  });

  it("halves every 48 hours", () => {
    expect(trendingScore([{ kind: "try", at: hoursAgo(48) }], NOW)).toBeCloseTo(0.5, 10);
    expect(trendingScore([{ kind: "try", at: hoursAgo(96) }], NOW)).toBeCloseTo(0.25, 10);
  });

  it("ignores anything older than seven days", () => {
    // Not "decayed to nearly nothing" — excluded, so a steady old catalogue
    // cannot accumulate a trending score out of last month's traffic.
    expect(trendingScore([{ kind: "report", at: hoursAgo(24 * 7 + 1) }], NOW)).toBe(0);
    expect(trendingScore([{ kind: "try", at: daysAgo(30) }], NOW)).toBe(0);
  });

  it("counts an event exactly on the boundary", () => {
    const onBoundary = trendingScore([{ kind: "try", at: hoursAgo(24 * 7) }], NOW);
    expect(onBoundary).toBeGreaterThan(0);
  });

  it("ignores a future event rather than weighting it above 1", () => {
    expect(trendingScore([{ kind: "try", at: hoursAgo(-5) }], NOW)).toBe(0);
  });

  it("ignores an unparseable timestamp", () => {
    expect(trendingScore([{ kind: "try", at: "not a date" }], NOW)).toBe(0);
  });

  it("sums", () => {
    const score = trendingScore(
      [
        { kind: "try", at: NOW },
        { kind: "try", at: hoursAgo(48) },
        { kind: "report", at: hoursAgo(24) },
      ],
      NOW,
    );

    expect(score).toBeCloseTo(1 + 0.5 + 3 * 0.5 ** 0.5, 10);
  });

  // The brief's sixth scenario.
  it("favours a burst in the last 48 hours over steady old traffic", () => {
    const burst = trendingScore(
      Array.from({ length: 20 }, () => ({ kind: "try" as const, at: hoursAgo(6) })),
      NOW,
    );

    const steady = trendingScore(
      Array.from({ length: 20 }, () => ({ kind: "try" as const, at: daysAgo(6) })),
      NOW,
    );

    expect(burst).toBeGreaterThan(steady * 5);
  });

  it("favours recent reports over recent tries", () => {
    const reportsOnly = trendingScore(
      Array.from({ length: 5 }, () => ({ kind: "report" as const, at: hoursAgo(12) })),
      NOW,
    );
    const triesOnly = trendingScore(
      Array.from({ length: 5 }, () => ({ kind: "try" as const, at: hoursAgo(12) })),
      NOW,
    );

    expect(reportsOnly).toBeGreaterThan(triesOnly);
  });
});