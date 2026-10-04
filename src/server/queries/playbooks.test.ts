import { describe, expect, it } from "vitest";

import { canShowSuccessRate, sortPlaybooks } from "@/server/queries/playbooks";
import type { PlaybookWithRelations } from "@/server/queries/types";

/**
 * These cover the ordering rules, not Supabase. Sorting lives in JS because
 * PostgREST cannot order by an embedded resource, which makes this logic load
 * bearing: a mistake here silently reorders the homepage.
 */
function playbook(
  slug: string,
  stats: Partial<PlaybookWithRelations["stats"]> | null,
  overrides: Partial<PlaybookWithRelations> = {},
): PlaybookWithRelations {
  return {
    slug,
    category_id: "cat-1",
    status: "published",
    promise: "",
    title: slug,
    who_for: null,
    who_not_for: null,
    time_min: null,
    time_max: null,
    outcome_unit: null,
    required_capability: "info",
    report_fields: {},
    followup_days: 7,
    preview_image_url: null,
    primary_agent_id: null,
    author_id: null,
    current_version_id: null,
    last_verified_at: null,
    tags: [],
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    category: {
      id: "cat-1",
      slug: "personal-finance",
      name: "Personal finance",
      emoji: "💰",
      description: null,
      sort: 10,
    },
    primary_agent: null,
    stats: stats
      ? {
          tried_count: 0,
          report_count: 0,
          worked: 0,
          partly: 0,
          didnt: 0,
          success_rate_raw: null,
          wilson_lb: null,
          median_amount: null,
          p25: null,
          p75: null,
          amount_n: 0,
          last30_success: null,
          evidence_score: 0,
          trending_score: 0,
          last_report_at: null,
          updated_at: "2026-01-01T00:00:00Z",
          playbook_id: "p-1",
          ...stats,
        }
      : null,
    ...overrides,
  } as PlaybookWithRelations;
}

const slugs = (rows: PlaybookWithRelations[]) => rows.map((row) => row.slug);

describe("sortPlaybooks", () => {
  const rows = [
    playbook("no-stats", null),
    playbook("strong", { evidence_score: 0.8, tried_count: 900, trending_score: 0.2 }),
    playbook("weak", { evidence_score: 0.1, tried_count: 10, trending_score: 0.9 }),
    playbook("unmeasured", { evidence_score: 0, tried_count: 5, trending_score: 0 }),
  ];

  it("orders by evidence score descending by default", () => {
    expect(slugs(sortPlaybooks(rows, "best_evidence"))).toEqual([
      "strong",
      "weak",
      "unmeasured",
      "no-stats",
    ]);
  });

  it("sorts a playbook with no stats row last, never first", () => {
    const sorted = sortPlaybooks(rows, "best_evidence");
    expect(sorted[sorted.length - 1]?.slug).toBe("no-stats");
  });

  it("orders by tried count for most_tried", () => {
    expect(slugs(sortPlaybooks(rows, "most_tried"))).toEqual([
      "strong",
      "weak",
      "unmeasured",
      "no-stats",
    ]);
  });

  it("orders by trending score, independently of evidence", () => {
    // Trending must be its own signal: AGENTS.md forbids letting any one signal
    // stand in for another, and the weak playbook is trending precisely
    // because it has little evidence.
    expect(slugs(sortPlaybooks(rows, "trending"))).toEqual([
      "weak",
      "strong",
      "unmeasured",
      "no-stats",
    ]);
  });

  it("orders by verification date, most recent first", () => {
    const dated = [
      playbook("old", { evidence_score: 0.9 }, { last_verified_at: "2026-01-01T00:00:00Z" }),
      playbook("new", { evidence_score: 0.1 }, { last_verified_at: "2026-09-01T00:00:00Z" }),
      playbook("never", { evidence_score: 0.95 }),
    ];
    expect(slugs(sortPlaybooks(dated, "recently_verified"))).toEqual(["new", "old", "never"]);
  });

  describe("highest_outcome", () => {
    it("ranks a reportable median above one below the amount threshold", () => {
      const list = [
        playbook("thin", { median_amount: 900, amount_n: 3 }),
        playbook("solid", { median_amount: 12, amount_n: 40 }),
      ];
      // The thin median is three times larger but may not be displayed at all,
      // so ranking on it would promote a number the UI refuses to show.
      expect(slugs(sortPlaybooks(list, "highest_outcome"))).toEqual(["solid", "thin"]);
    });

    it("falls back to evidence when neither median is reportable", () => {
      const list = [
        playbook("low-evidence", { evidence_score: 0.2, median_amount: 5, amount_n: 1 }),
        playbook("high-evidence", { evidence_score: 0.9, median_amount: 50, amount_n: 2 }),
      ];
      expect(slugs(sortPlaybooks(list, "highest_outcome"))).toEqual([
        "high-evidence",
        "low-evidence",
      ]);
    });

    it("uses the median when both are reportable", () => {
      const list = [
        playbook("small", { median_amount: 10, amount_n: 50 }),
        playbook("large", { median_amount: 400, amount_n: 50 }),
      ];
      expect(slugs(sortPlaybooks(list, "highest_outcome"))).toEqual(["large", "small"]);
    });
  });

  it("does not mutate the input array", () => {
    const original = [...rows];
    sortPlaybooks(rows, "most_tried");
    expect(rows).toEqual(original);
  });
});

describe("canShowSuccessRate", () => {
  it("is false below the 20-report threshold", () => {
    expect(canShowSuccessRate(0)).toBe(false);
    expect(canShowSuccessRate(19)).toBe(false);
  });

  it("is true at or above the threshold", () => {
    expect(canShowSuccessRate(20)).toBe(true);
    expect(canShowSuccessRate(1200)).toBe(true);
  });

  it("treats a missing stats row as below the threshold", () => {
    expect(canShowSuccessRate(null)).toBe(false);
    expect(canShowSuccessRate(undefined)).toBe(false);
  });
});