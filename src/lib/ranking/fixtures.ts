/**
 * Fixture builders for the ranking tests.
 *
 * Shared, so the six scenarios in the brief and the unit tests underneath them
 * describe the same world: the same playbook, the same aged account, the same
 * verified-or-not reporter. A ranking test that builds its own literals is a
 * test whose fixtures drift from the ones the scenario above it used, and the
 * drift is invisible until two tests disagree about the same playbook.
 *
 * Deliberately boring data — round numbers, fixed dates, ids that are readably
 * different (`p-a` versus `p-b`). The point of these tests is arithmetic, and
 * arithmetic is much easier to check when nothing else is in the way.
 */

import type { PeerStat, RankablePlaybook, RankableReport, RankableTry } from "@/lib/ranking/types";
import type { ReportResult } from "@/lib/report/shape";

/** A fixed "today", so every date in these fixtures is relative to a known instant. */
export const NOW = new Date("2026-06-01T00:00:00.000Z");

const DAY = 24 * 60 * 60 * 1000;

/** `days` before NOW, as an ISO string — the shape PostgREST returns. */
export function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * DAY).toISOString();
}

export function playbook(overrides: Partial<RankablePlaybook> = {}): RankablePlaybook {
  return {
    id: "p-a",
    slug: "lower-your-internet-bill",
    categoryId: "cat-money",
    outcomeType: "money_monthly",
    authorId: null,
    lastVerifiedAt: daysAgo(3),
    amountCap: 5_000,
    ...overrides,
  };
}

export function report(overrides: Partial<RankableReport> = {}): RankableReport {
  return {
    id: "r-1",
    reporterId: "reader-1",
    result: "worked",
    amount: 40,
    hoursSaved: null,
    status: "approved",
    isOutlier: false,
    hasApprovedEvidence: false,
    reporterEmailVerified: true,
    reporterCreatedAt: daysAgo(400),
    createdAt: daysAgo(1),
    ...overrides,
  };
}

export function reporter(
  id: string,
  overrides: { emailVerified?: boolean; createdAt?: string } = {},
) {
  return {
    id,
    emailVerified: overrides.emailVerified ?? true,
    createdAt: overrides.createdAt ?? daysAgo(400),
  };
}

export function try_(overrides: Partial<RankableTry> = {}): RankableTry {
  return {
    userId: "reader-1",
    deviceId: "device-1",
    action: "started",
    createdAt: daysAgo(1),
    ...overrides,
  };
}

/**
 * `count` reports from `count` distinct readers, all filed `ageDays` ago.
 *
 * The workhorse for every scenario below: a report count on its own means
 * nothing, and building twenty of them by hand is how a fixture ends up with
 * nineteen.
 */
export function reports(
  count: number,
  options: {
    result?: ReportResult | ReportResult[];
    amount?: number | null;
    ageDays?: number;
    evidenceEvery?: number;
    prefix?: string;
  } = {},
): RankableReport[] {
  const { result = "worked", amount = 40, ageDays = 1, evidenceEvery = 0, prefix = "r" } = options;

  return Array.from({ length: count }, (_unused, index) =>
    report({
      id: `${prefix}-${index + 1}`,
      reporterId: `${prefix}-reader-${index + 1}`,
      result: Array.isArray(result) ? (result[index % result.length] as ReportResult) : result,
      amount,
      createdAt: daysAgo(ageDays),
      hasApprovedEvidence: evidenceEvery > 0 && index % evidenceEvery === 0,
    }),
  );
}

/** The reporters that go with `reports(...)`, matching ids. */
export function reportersFor(
  rows: readonly RankableReport[],
  overrides: { emailVerified?: boolean; accountAgeDays?: number } = {},
): { id: string; emailVerified: boolean; createdAt: string }[] {
  return [...new Set(rows.map((row) => row.reporterId))].map((id) => ({
    id,
    emailVerified: overrides.emailVerified ?? true,
    createdAt: daysAgo(overrides.accountAgeDays ?? 400),
  }));
}

/** `count` distinct people who each started the try flow once. */
export function tries(count: number, prefix = "t"): RankableTry[] {
  return Array.from({ length: count }, (_unused, index) =>
    try_({ userId: `${prefix}-user-${index + 1}`, deviceId: `${prefix}-device-${index + 1}` }),
  );
}

/** A catalogue of already-aggregated peers, for the relative terms. */
export function peer(overrides: Partial<PeerStat> = {}): PeerStat {
  return {
    playbookId: "p-peer",
    categoryId: "cat-money",
    outcomeType: "money_monthly",
    medianAmount: 40,
    amountN: 20,
    triedCount: 100,
    wilsonLowerBound: 0.5,
    weightedSuccess: 0.6,
    ...overrides,
  };
}