import { describe, expect, it } from "vitest";

import {
  AMOUNT_THRESHOLD,
  PROVEN_MIN_EVIDENCE,
  PROVEN_MIN_REPORTS,
  REPORT_THRESHOLD,
} from "@/config/ranking";
import { aggregate, applyRelativeTerms, countDistinctTries } from "@/lib/ranking/aggregate";
import type { PeerStat, RankableReport } from "@/lib/ranking/types";
import {
  NOW,
  daysAgo,
  peer,
  playbook,
  report,
  reports,
  reportersFor,
  tries,
  try_,
} from "@/lib/ranking/fixtures";

/** Aggregate a set of reports with the reporters they imply. */
function aggregateReports(
  rows: readonly RankableReport[],
  overrides: {
    playbookOverrides?: Parameters<typeof playbook>[0];
    tryRows?: ReturnType<typeof tries>;
    reporterOverrides?: { emailVerified?: boolean; accountAgeDays?: number };
  } = {},
) {
  return aggregate(
    {
      playbook: playbook(overrides.playbookOverrides ?? {}),
      reports: rows,
      reporters: reportersFor(rows, overrides.reporterOverrides ?? {}),
      tries: overrides.tryRows ?? [],
    },
    NOW,
  );
}

/** A `PeerStat` from an aggregated row, for the second pass. */
/**
 * The peer shape `applyRelativeTerms` compares against, plus the one field it
 * reads about the playbook itself. Returned as one object so a caller can use
 * it as a catalogue entry or as `self` without having to remember which is which
 * — the two differ by exactly this field, and mixing them up is a compile
 * error rather than a wrong number.
 */
function asPeer(
  stats: ReturnType<typeof aggregate>,
): PeerStat & { lastVerifiedAt: null } {
  return {
    playbookId: "p-a",
    lastVerifiedAt: null,
    categoryId: "cat-money",
    outcomeType: "money_monthly",
    medianAmount: stats.medianAmount,
    amountN: stats.amountN,
    triedCount: stats.triedCount,
    wilsonLowerBound: stats.wilsonLowerBound,
    weightedSuccess: stats.weightedSuccess ?? 0,
  };
}

describe("countDistinctTries", () => {
  it("counts people, not events", () => {
    // The number the site publishes says "people tried this", so one reader
    // opening the flow five times is one try.
    const rows = Array.from({ length: 5 }, () => try_({ userId: "reader-1" }));
    expect(countDistinctTries(rows)).toBe(1);
  });

  it("counts a signed-in reader once across two devices", () => {
    expect(
      countDistinctTries([
        try_({ userId: "reader-1", deviceId: "phone" }),
        try_({ userId: "reader-1", deviceId: "laptop" }),
      ]),
    ).toBe(1);
  });

  it("counts an anonymous reader by device", () => {
    expect(
      countDistinctTries([
        try_({ userId: null, deviceId: "device-1" }),
        try_({ userId: null, deviceId: "device-1" }),
        try_({ userId: null, deviceId: "device-2" }),
      ]),
    ).toBe(2);
  });

  it("counts only 'started' events", () => {
    // A 'copied' event is the copy; a 'started' event is the try. Counting
    // both would report every re-copy as a new person trying it.
    expect(
      countDistinctTries([
        try_({ userId: "reader-1", action: "started" }),
        try_({ userId: "reader-2", action: "copied" }),
        try_({ userId: "reader-3", action: "opened" }),
      ]),
    ).toBe(1);
  });

  it("does not merge a signed-in reader with an anonymous one on the same device", () => {
    // Prefix them, or `null` would collapse into the same bucket as a real id.
    expect(
      countDistinctTries([
        try_({ userId: "reader-1", deviceId: "shared-kiosk" }),
        try_({ userId: null, deviceId: "shared-kiosk" }),
      ]),
    ).toBe(2);
  });
});

describe("the counts", () => {
  it("splits worked, partly and didn't", () => {
    const rows = reports(30, { result: ["worked", "partly", "didnt"] });
    const stats = aggregateReports(rows);

    expect(stats.reportCount).toBe(30);
    expect(stats.worked).toBe(10);
    expect(stats.partly).toBe(10);
    expect(stats.didnt).toBe(10);
  });

  it("counts a partly as a report", () => {
    // It has an answer. It just is not the best answer.
    expect(aggregateReports(reports(20, { result: "partly" })).reportCount).toBe(20);
  });

  it("excludes rejected reports from every count", () => {
    const rows = [
      ...reports(5),
      ...reports(5, { prefix: "rej" }).map((row) => ({ ...row, status: "rejected" as const })),
    ];
    const stats = aggregateReports(rows);

    expect(stats.reportCount).toBe(5);
    expect(stats.worked).toBe(5);
  });

  it("drops an outlier from the counts and from the money", () => {
    // The brief is explicit twice — "outlier reports weigh 0", and in the
    // required scenarios "outliers do not change stats". A report that moved
    // `report_count` would change a stat, so the exclusion is total. The row
    // itself is not touched: this is a rule about what the site counts, not a
    // deletion, and an admin still sees it.
    const rows = [...reports(5), report({ id: "out-1", isOutlier: true, amount: 9_000 })];
    const stats = aggregateReports(rows);

    expect(stats.reportCount).toBe(5);
    expect(stats.worked).toBe(5);
    expect(stats.amountN).toBe(5);
    expect(stats.medianAmount).toBe(40);
  });

  it("excludes the author's own reports, and their count with it", () => {
    const rows = reports(20);
    const authorReports = reports(20, { prefix: "own" }).map((row) => ({
      ...row,
      reporterId: "the-author",
    }));

    const stats = aggregate(
      {
        playbook: playbook({ authorId: "the-author" }),
        reports: [...rows, ...authorReports],
        reporters: [
          ...reportersFor(rows),
          { id: "the-author", emailVerified: true, createdAt: daysAgo(400) },
        ],
        tries: [],
      },
      NOW,
    );

    expect(stats.reportCount).toBe(20);
    expect(stats.worked).toBe(20);
  });

  it("withholds the percentage below 20 reports", () => {
    expect(aggregateReports(reports(REPORT_THRESHOLD - 1)).showRate).toBe(false);
    expect(aggregateReports(reports(REPORT_THRESHOLD)).showRate).toBe(true);
  });

  it("does not let an author unlock the percentage with their own rows", () => {
    // Counting excluded reports towards the threshold while excluding them
    // from the numerator would let an author publish a percentage nobody
    // else's report supports.
    const own = reports(REPORT_THRESHOLD, { prefix: "own" }).map((row) => ({
      ...row,
      reporterId: "the-author",
    }));

    const stats = aggregate(
      {
        playbook: playbook({ authorId: "the-author" }),
        reports: own,
        reporters: [{ id: "the-author", emailVerified: true, createdAt: daysAgo(400) }],
        tries: [],
      },
      NOW,
    );

    expect(stats.showRate).toBe(false);
    expect(stats.successRateRaw).toBeNull();
  });

  it("withholds the median below ten amounts", () => {
    expect(aggregateReports(reports(AMOUNT_THRESHOLD - 1, { amount: 20 })).showMedian).toBe(false);
    expect(aggregateReports(reports(AMOUNT_THRESHOLD, { amount: 20 })).showMedian).toBe(true);
  });

  it("is null for both figures with no reports at all", () => {
    const stats = aggregateReports([]);

    expect(stats.successRateRaw).toBeNull();
    expect(stats.medianAmount).toBeNull();
    expect(stats.weightedSuccess).toBeNull();
    expect(stats.wilsonLowerBound).toBe(0);
  });
});

describe("successRateRaw", () => {
  it("is worked over the counted total, because that is what the label says", () => {
    // The page prints "% worked". A rate that scored partly at half would be a
    // different number wearing that label.
    const stats = aggregateReports(reports(20, { result: ["worked", "didnt"] }));
    expect(stats.successRateRaw).toBeCloseTo(0.5, 10);
  });

  it("is not the same number as the weighted success", () => {
    // They differ on purpose: this one is raw, that one is trust-weighted and
    // decayed, and Wilson is computed on the second.
    const rows = reports(20, { result: ["worked", "didnt"], ageDays: 200 });
    const stats = aggregateReports(rows);

    expect(stats.successRateRaw).toBeCloseTo(0.5, 10);
    expect(stats.weightedSuccess).toBeLessThan(0.5);
  });
});

describe("last30Success", () => {
  it("is the worked share of the last thirty days only", () => {
    const rows = [
      ...reports(10, { ageDays: 2 }),
      ...reports(10, { ageDays: 100, prefix: "old" }).map((row) => ({
        ...row,
        result: "didnt" as const,
      })),
    ];

    const stats = aggregateReports(rows);
    expect(stats.last30Success).toBeCloseTo(1, 10);
    expect(stats.successRateRaw).toBeCloseTo(0.5, 10);
  });

  it("is null when nothing was reported in the window", () => {
    expect(aggregateReports(reports(5, { ageDays: 90 })).last30Success).toBeNull();
  });

  it("reports the most recent report's date", () => {
    const rows = [report({ id: "a", createdAt: daysAgo(30) }), report({ id: "b", createdAt: daysAgo(2) })];
    expect(new Date(aggregateReports(rows).lastReportAt as string).toISOString()).toBe(daysAgo(2));
  });
});

describe("Proven to work", () => {
  it("needs both twenty reports and three approved pieces of evidence", () => {
    const plenty = aggregateReports(reports(PROVEN_MIN_REPORTS, { evidenceEvery: 3 }));
    expect(plenty.strongestEligible).toBe(true);

    const noEvidence = aggregateReports(reports(60));
    expect(noEvidence.strongestEligible).toBe(false);

    const tooFew = aggregateReports(reports(PROVEN_MIN_REPORTS - 1, { evidenceEvery: 1 }));
    expect(tooFew.strongestEligible).toBe(false);

    // Twenty reports and two pieces of evidence: still not proven. The brief
    // says three, and "at least one" is the reading that would ship.
    const twoEvidence = aggregateReports(
      reports(40).map((row, index) => ({
        ...row,
        hasApprovedEvidence: index < PROVEN_MIN_EVIDENCE - 1,
      })),
    );
    expect(twoEvidence.strongestEligible).toBe(false);
  });

  it("counts evidence only on reports that count", () => {
    const rows = [
      ...reports(20),
      report({ id: "rej", status: "rejected", hasApprovedEvidence: true }),
    ];
    expect(aggregateReports(rows).evidenceApproved).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/* The brief's six required scenarios                                          */
/* -------------------------------------------------------------------------- */

describe("scenario 1 — a smaller, better-evidenced playbook outranks a bigger, worse one", () => {
  it("ranks B above A", () => {
    // A: 500 tries, 30 reports, 40% worked. B: 100 tries, 40 reports, 80%
    // worked with evidence.
    const a = aggregate(
      {
        playbook: playbook({ id: "p-a" }),
        reports: reports(30, { result: ["worked", "didnt"], prefix: "a" }),
        reporters: reportersFor(reports(30, { result: ["worked", "didnt"], prefix: "a" })),
        tries: tries(500, "a"),
      },
      NOW,
    );

    const bRows = reports(40, { result: ["worked", "worked", "worked", "worked", "didnt"], prefix: "b" }).map(
      (row, index) => ({ ...row, hasApprovedEvidence: index % 2 === 0 }),
    );
    const b = aggregate(
      {
        playbook: playbook({ id: "p-b" }),
        reports: bRows,
        reporters: reportersFor(bRows),
        tries: tries(100, "b"),
      },
      NOW,
    );

    const scoreOf = (s: typeof a) =>
      applyRelativeTerms(
        { ...asPeer(s), playbookId: s === a ? "p-a" : "p-b" },
        [asPeer(a), asPeer(b)].map((peerStat, index) => ({ ...peerStat, playbookId: `p-${index}` })),
        500,
        NOW,
      ).evidenceScore;

    expect(a.triedCount).toBe(500);
    expect(b.triedCount).toBe(100);
    expect(a.reportCount).toBe(30);
    expect(b.reportCount).toBe(40);

    expect(scoreOf(b)).toBeGreaterThan(scoreOf(a));
  });

  it("would not, if usage were allowed to outweigh the evidence", () => {
    // The reason usage is 0.10 and not 0.30: five times the tries is worth
    // less than a rate that is twice as good on more reports.
    const a = aggregateReports(reports(30, { result: ["worked", "didnt"] }));
    const b = aggregateReports(reports(40, { result: ["worked", "worked", "worked", "worked", "didnt"] }));

    expect(b.wilsonLowerBound).toBeGreaterThan(a.wilsonLowerBound);
  });
});

describe("scenario 2 — five perfect reports are not a rate", () => {
  it("withholds the percentage and ranks below a well-reported playbook", () => {
    const small = aggregateReports(reports(5), { tryRows: [] });
    const large = aggregateReports(
      reports(60, { result: ["worked", "worked", "worked", "didnt"] }),
    );

    expect(small.showRate).toBe(false);
    expect(small.wilsonLowerBound).toBeLessThan(large.wilsonLowerBound);

    const peers = [asPeer(small), asPeer(large)];
    const score = (stats: typeof small, id: string) =>
      applyRelativeTerms({ ...asPeer(stats), playbookId: id }, peers, 1_000, NOW).evidenceScore;

    expect(score(large, "p-large")).toBeGreaterThan(score(small, "p-small"));
  });
});

describe("scenario 3 — the author's own reports and outliers change nothing", () => {
  it("produces an identical row with and without them", () => {
    const base = reports(20);

    const withAuthorAndOutliers = [
      ...base,
      ...reports(50, { prefix: "own" }).map((row) => ({ ...row, reporterId: "the-author" })),
      report({ id: "out-1", reporterId: "outlier-reader", isOutlier: true, amount: 9_999 }),
    ];

    const withRow = (rows: RankableReport[], authorId: string | null) =>
      aggregate(
        {
          playbook: playbook({ authorId }),
          reports: rows,
          reporters: reportersFor(rows).map((reporter) =>
            reporter.id === "the-author" ? { ...reporter, emailVerified: true } : reporter,
          ),
          tries: [],
        },
        NOW,
      );

    const clean = withRow(base, "the-author");
    const dirty = withRow(withAuthorAndOutliers, "the-author");

    expect(dirty.reportCount).toBe(clean.reportCount);
    expect(dirty.worked).toBe(clean.worked);
    expect(dirty.successRateRaw).toBe(clean.successRateRaw);
    expect(dirty.weightedSuccess).toBe(clean.weightedSuccess);
    expect(dirty.wilsonLowerBound).toBe(clean.wilsonLowerBound);
    expect(dirty.medianAmount).toBe(clean.medianAmount);
    expect(dirty.amountN).toBe(clean.amountN);
  });
});

describe("scenario 4 — old reports count for less", () => {
  it("gives a year-old playbook a far weaker score than a fresh one", () => {
    const fresh = aggregateReports(reports(20, { result: ["worked", "didnt"], ageDays: 1 }));
    const old = aggregateReports(reports(20, { result: ["worked", "didnt"], ageDays: 365 }));

    // The published percentage is identical, which is the point: decay is
    // applied where it can change the order and not to the number shown.
    expect(fresh.successRateRaw).toBe(old.successRateRaw);
    expect(old.wilsonLowerBound).toBeLessThan(fresh.wilsonLowerBound / 2);
  });

  it("weighs the recent reports in a mixed set more than the old ones", () => {
    // The point-estimate rate is invariant when every report decays alike, so
    // the mechanism that actually separates them is the weight each one
    // carries. Here half the reports are a year old and half are from today.
    const mixed = aggregateReports([
      ...reports(10, { result: "worked", ageDays: 365, prefix: "old" }),
      ...reports(10, { result: "didnt", ageDays: 1, prefix: "new" }),
    ]);

    // Ten decades-old wins and ten fresh losses: an unweighted mean is 0.5, and
    // the decayed one is far below it because the wins carry 1/64th the weight.
    expect(mixed.successRateRaw).toBeCloseTo(0.5, 10);
    expect(mixed.weightedSuccess!).toBeLessThan(0.1);
  });
});

describe("scenario 5 — referral codes and votes change nothing", () => {
  it("scores identically with and without them", () => {
    // The type ranking consumes has no field to read a referral code from, so
    // this test is nearly redundant by construction — which is the point. The
    // guarantee is structural, and the test says so.
    const base = reports(20);
    const withReferrals = base.map((row, index) => ({
      ...row,
      ...({ referralCode: index % 2 === 0 ? "GT09WC" : null } as Record<string, unknown>),
    })) as RankableReport[];

    const scoreOf = (rows: RankableReport[]) =>
      aggregate(
        {
          playbook: playbook(),
          reports: rows,
          reporters: reportersFor(rows),
          tries: [],
        },
        NOW,
      );

    const clean = scoreOf(base);
    const referred = scoreOf(withReferrals);

    expect(referred.wilsonLowerBound).toBe(clean.wilsonLowerBound);
    expect(referred.weightedSuccess).toBe(clean.weightedSuccess);
    expect(referred.successRateRaw).toBe(clean.successRateRaw);
    expect(referred.medianAmount).toBe(clean.medianAmount);
  });
});

describe("scenario 6 — trending favours a burst over steady old traffic", () => {
  it("scores the burst higher", () => {
    const HOUR = 60 * 60 * 1000;
    const recent = (hours: number) => new Date(NOW.getTime() - hours * HOUR);

    // Both playbooks have the same reports, filed at the same age, and the
    // same number of tries. The only difference is when the copies happened:
    // six hours ago against six days ago. Holding the reports fixed is what
    // makes the next assertion meaningful.
    const shared = reports(10, { ageDays: 6 });

    const burst = aggregateReports(shared, {
      tryRows: tries(30).map((row) => ({ ...row, action: "copied" as const, createdAt: recent(6) })),
    });
    const steady = aggregateReports(shared, {
      tryRows: tries(30).map((row) => ({ ...row, action: "copied" as const, createdAt: recent(144) })),
    });

    expect(burst.trendingScore).toBeGreaterThan(steady.trendingScore * 3);
    // And it does not touch the evidence score, which is what trending is for.
    expect(burst.wilsonLowerBound).toBe(steady.wilsonLowerBound);
  });
});

/* -------------------------------------------------------------------------- */

describe("applyRelativeTerms", () => {
  // Peers in dollars a year, which is what a monthly median of $40 is. 100 /
  // 200 / 300 here are $8.33, $16.67 and $25 a month.
  const catalogue: PeerStat[] = [
    peer({ playbookId: "p-1", medianAmount: 8.33, triedCount: 1_000 }),
    peer({ playbookId: "p-2", medianAmount: 16.67, triedCount: 500 }),
    peer({ playbookId: "p-3", medianAmount: 25, triedCount: 250 }),
  ];

  const self = {
    playbookId: "p-self",
    categoryId: "cat-money",
    outcomeType: "money_monthly" as const,
    medianAmount: 40,
    amountN: 20,
    triedCount: 1_000,
    wilsonLowerBound: 0.7,
    lastVerifiedAt: daysAgo(2),
  };

  it("is the weighted sum of the four terms", () => {
    const { evidenceScore } = applyRelativeTerms(self, catalogue, 1_000, NOW);

    // 0.55·0.7 + 0.20·1 + 0.15·0.977 + 0.10·1.0 = 0.8316
    expect(evidenceScore).toBeCloseTo(0.8316, 3);
    expect(evidenceScore).toBeLessThanOrEqual(1);
  });

  it("awards verified_recent inside 30 days and not outside", () => {
    expect(applyRelativeTerms(self, catalogue, 1_000, NOW).badges).toContain("verified_recent");
    expect(
      applyRelativeTerms({ ...self, lastVerifiedAt: daysAgo(31) }, catalogue, 1_000, NOW).badges,
    ).not.toContain("verified_recent");
  });

  it("does not award verified_recent to a playbook that was never verified", () => {
    expect(
      applyRelativeTerms({ ...self, lastVerifiedAt: null }, catalogue, 1_000, NOW).badges,
    ).not.toContain("verified_recent");
  });

  it("awards high_success at the brief's threshold", () => {
    expect(applyRelativeTerms(self, catalogue, 1_000, NOW).badges).toContain("high_success");
    expect(
      applyRelativeTerms({ ...self, wilsonLowerBound: 0.59 }, catalogue, 1_000, NOW).badges,
    ).not.toContain("high_success");
  });

  it("awards most_tried and top_saver to the top of its category", () => {
    const badges = applyRelativeTerms(self, catalogue, 1_000, NOW).badges;
    expect(badges).toContain("most_tried");
    expect(badges).toContain("top_saver");
  });

  it("awards neither to the bottom of its category", () => {
    const badges = applyRelativeTerms(
      { ...self, triedCount: 1, medianAmount: 1, wilsonLowerBound: 0 },
      catalogue,
      1_000,
      NOW,
    ).badges;

    expect(badges).not.toContain("most_tried");
    expect(badges).not.toContain("top_saver");
  });

  it("only compares within its own category", () => {
    const otherCategory = [
      peer({ playbookId: "q-1", categoryId: "cat-travel", medianAmount: 9_000, triedCount: 9_000 }),
    ];

    const badges = applyRelativeTerms(
      { ...self, triedCount: 1, medianAmount: 1 },
      otherCategory,
      9_000,
      NOW,
    ).badges;

    expect(badges).not.toContain("top_saver");
    expect(badges).not.toContain("most_tried");
  });

  it("awards no peer-relative badge when there are no peers", () => {
    // A percentile of an empty set is not a claim, so the two badges that need
    // peers are withheld. The two that do not — recent, high success — are
    // statements about this playbook alone and still stand.
    const badges = applyRelativeTerms(self, [], 1_000, NOW).badges;

    expect(badges).not.toContain("top_saver");
    expect(badges).not.toContain("most_tried");
    expect(badges).toEqual(["verified_recent", "high_success"]);
  });
});