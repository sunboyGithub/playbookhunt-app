import { describe, expect, it } from "vitest";

import {
  AMOUNT_THRESHOLD,
  BADGE_TOP_FRACTION,
  HIGH_SUCCESS_WILSON,
  PROVEN_MIN_EVIDENCE,
  PROVEN_MIN_REPORTS,
  RANKING_WEIGHTS,
  REPORT_HALF_LIFE_DAYS,
  REPORT_THRESHOLD,
  SUCCESS_VALUE,
  TRENDING_HALF_LIFE_HOURS,
  TRENDING_WINDOW_DAYS,
  WILSON_Z,
} from "@/config/ranking";
import { AMOUNT_THRESHOLD as TYPES_AMOUNT, REPORT_THRESHOLD as TYPES_REPORT } from "@/server/queries/types";

/**
 * The config file is the one place where a number can be changed without
 * anything failing, because nothing else is written down to contradict it.
 * These assertions are the contradiction.
 */
describe("ranking config", () => {
  it("uses the brief's weights, in the brief's order", () => {
    expect(RANKING_WEIGHTS).toEqual({
      wilson: 0.55,
      outcome: 0.2,
      recency: 0.15,
      usage: 0.1,
    });
  });

  it("sums the weights to 1, so the score stays in [0, 1]", () => {
    const total = Object.values(RANKING_WEIGHTS).reduce((sum, weight) => sum + weight, 0);
    expect(total).toBeCloseTo(1, 10);
  });

  it("gives evidence the majority", () => {
    // The one that matters: popularity must never be able to outvote whether
    // it worked.
    expect(RANKING_WEIGHTS.wilson).toBeGreaterThan(
      RANKING_WEIGHTS.outcome + RANKING_WEIGHTS.recency + RANKING_WEIGHTS.usage,
    );
  });

  it("uses the brief's half-lives and window", () => {
    expect(REPORT_HALF_LIFE_DAYS).toBe(60);
    expect(TRENDING_HALF_LIFE_HOURS).toBe(48);
    expect(TRENDING_WINDOW_DAYS).toBe(7);
    expect(WILSON_Z).toBe(1.96);
  });

  it("uses the brief's thresholds", () => {
    expect(REPORT_THRESHOLD).toBe(20);
    expect(AMOUNT_THRESHOLD).toBe(10);
    expect(PROVEN_MIN_REPORTS).toBe(20);
    expect(PROVEN_MIN_EVIDENCE).toBe(3);
    expect(HIGH_SUCCESS_WILSON).toBe(0.6);
    expect(BADGE_TOP_FRACTION).toBe(0.1);
  });

  it("scores partly at half", () => {
    expect(SUCCESS_VALUE).toEqual({ worked: 1, partly: 0.5, didnt: 0 });
  });

  it("agrees with the thresholds the rest of the app already used", () => {
    // `src/server/queries/types.ts` had these two before ranking existed, and
    // the detail page reads its thresholds from there. If either moves alone,
    // the page and the score can disagree about when a number may be shown.
    expect(REPORT_THRESHOLD).toBe(TYPES_REPORT);
    expect(AMOUNT_THRESHOLD).toBe(TYPES_AMOUNT);
  });
});