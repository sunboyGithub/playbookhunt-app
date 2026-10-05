import { describe, expect, it } from "vitest";

import { MIN_OUTCOME_PEERS } from "@/config/ranking";
import { comparableMedian, outcomeClass, outcomeStrength, percentileOf } from "@/lib/ranking/outcome";
import { peer } from "@/lib/ranking/fixtures";

describe("outcomeClass", () => {
  it("puts every money outcome in one class", () => {
    expect(outcomeClass("money_monthly")).toBe("money");
    expect(outcomeClass("money_yearly")).toBe("money");
    expect(outcomeClass("money_once")).toBe("money");
  });

  it("puts hours in its own class", () => {
    expect(outcomeClass("time_hours")).toBe("time");
  });

  it("gives a binary playbook no class at all", () => {
    // There is no amount to compare, so it belongs in neither percentile pool.
    expect(outcomeClass("binary")).toBeNull();
  });
});

describe("comparableMedian", () => {
  it("annualises a monthly median", () => {
    expect(comparableMedian(40, "money_monthly")).toBe(480);
  });

  it("leaves a yearly median alone", () => {
    expect(comparableMedian(480, "money_yearly")).toBe(480);
  });

  it("leaves a one-off alone rather than inventing a rate", () => {
    // Dividing a one-off saving by twelve would claim it is worth $X a year,
    // which is a rate nobody reported.
    expect(comparableMedian(2_000, "money_once")).toBe(2_000);
  });

  it("leaves hours alone", () => {
    expect(comparableMedian(6, "time_hours")).toBe(6);
  });

  it("is null for a binary playbook and for no median at all", () => {
    expect(comparableMedian(100, "binary")).toBeNull();
    expect(comparableMedian(null, "money_monthly")).toBeNull();
  });

  it("makes a monthly and a yearly playbook comparable", () => {
    // The whole reason normalisation exists: $40/month and $480/year are the
    // same saving and must land on the same number.
    expect(comparableMedian(40, "money_monthly")).toBe(comparableMedian(480, "money_yearly"));
  });
});

describe("percentileOf", () => {
  it("is neutral with no peers", () => {
    expect(percentileOf(10, [])).toBe(0.5);
  });

  it("is 1 when every peer is lower", () => {
    expect(percentileOf(100, [10, 20, 30])).toBe(1);
  });

  it("is 0 when every peer is higher", () => {
    expect(percentileOf(5, [10, 20, 30])).toBe(0);
  });

  it("gives a tied playbook the middle of its ties", () => {
    // Three peers, one of them equal: 1 below, 1 equal, 1 above →
    // (1 + 0.5) / 3. The alternative, counting ties as failures, penalises
    // every playbook for the ties of others.
    expect(percentileOf(20, [10, 20, 30])).toBeCloseTo(1.5 / 3, 10);
  });
});

describe("outcomeStrength", () => {
  /** A playbook with a median and enough amounts to be ranked at all. */
  const self = (overrides = {}) => ({
    playbookId: "p-self",
    categoryId: "cat-money",
    outcomeType: "money_monthly" as const,
    medianAmount: 40,
    amountN: 20,
    ...overrides,
  });

  it("is neutral below five amounts", () => {
    expect(outcomeStrength(self({ amountN: 4 }), [peer(), peer(), peer()])).toBe(0.5);
  });

  it("is neutral for a binary playbook", () => {
    expect(
      outcomeStrength(self({ outcomeType: "binary", medianAmount: null }), [
        peer(),
        peer(),
        peer(),
      ]),
    ).toBe(0.5);
  });

  it("is neutral with no median, however many amounts", () => {
    expect(outcomeStrength(self({ medianAmount: null }), [peer(), peer(), peer()])).toBe(0.5);
  });

  it("is neutral below the minimum peer count", () => {
    // The documented deviation from the brief's literal text. With two
    // peers a percentile is 0, 0.5 or 1, so the entire 0.20 outcome term
    // would be decided by one other playbook's median.
    const peers = [peer(), peer()];
    expect(peers.length).toBeLessThan(MIN_OUTCOME_PEERS);

    expect(outcomeStrength(self({ medianAmount: 1_000 }), peers)).toBe(0.5);
    expect(outcomeStrength(self({ medianAmount: 1 }), peers)).toBe(0.5);
  });

  it("ranks once there are enough peers", () => {
    // Peers are monthly medians of $8.33 / $16.67 / $25; self is $40.
    const peers = [
      peer({ playbookId: "p-1", medianAmount: 8.33 }),
      peer({ playbookId: "p-2", medianAmount: 16.67 }),
      peer({ playbookId: "p-3", medianAmount: 25 }),
    ];

    expect(outcomeStrength(self({ medianAmount: 40 }), peers)).toBe(1);
    expect(outcomeStrength(self({ medianAmount: 1 }), peers)).toBe(0);
    // Tied with p-3, which is the highest of them: two below, one equal →
    // (2 + 0.5·1) / 3. Counting ties as failures would put it at 2/3.
    expect(outcomeStrength(self({ medianAmount: 25 }), peers)).toBeCloseTo(5 / 6, 10);
  });

  it("ignores peers with fewer than five amounts", () => {
    // A peer with three amounts has a median that is three people's guesses.
    const peers = [
      peer({ playbookId: "p-1", medianAmount: 1, amountN: 3 }),
      peer({ playbookId: "p-2", medianAmount: 2, amountN: 30 }),
      peer({ playbookId: "p-3", medianAmount: 3, amountN: 30 }),
    ];

    // Only p-2 and p-3 count, so 2 peers < MIN_OUTCOME_PEERS → neutral.
    expect(outcomeStrength(self({ medianAmount: 40 }), peers)).toBe(0.5);
  });

  it("never compares hours against money", () => {
    // There is no defensible exchange rate between an hour and a dollar, and
    // inventing one would let a time playbook out-rank a money one on a number
    // chosen here.
    // A category whose reported amounts are dollars, ranked against a
    // playbook measured in hours.
    const moneyPeers = [
      peer({ playbookId: "p-1", outcomeType: "money_monthly", medianAmount: 3 }),
      peer({ playbookId: "p-2", outcomeType: "money_monthly", medianAmount: 4 }),
      peer({ playbookId: "p-3", outcomeType: "money_monthly", medianAmount: 5 }),
    ];

    expect(
      outcomeStrength(self({ outcomeType: "time_hours", medianAmount: 10 }), moneyPeers),
    ).toBe(0.5);

    // And the same in reverse: a money playbook does not get ranked by the
    // hours its neighbours saved. One would be the *worst* money outcome
    // against those peers, and instead it stays neutral.
    const hourPeers = [
      peer({ playbookId: "p-1", outcomeType: "time_hours", medianAmount: 3 }),
      peer({ playbookId: "p-2", outcomeType: "time_hours", medianAmount: 4 }),
      peer({ playbookId: "p-3", outcomeType: "time_hours", medianAmount: 5 }),
    ];
    expect(outcomeStrength(self({ medianAmount: 1 }), hourPeers)).toBe(0.5);

    // The peers are not simply being ignored, though — with peers of their
    // own class the same playbook ranks last.
    expect(outcomeStrength(self({ medianAmount: 1 }), moneyPeers)).toBe(0);
  });

  it("compares a monthly playbook against a yearly one by normalised amount", () => {
    const peers = [
      peer({ playbookId: "p-1", outcomeType: "money_yearly", medianAmount: 100 }),
      peer({ playbookId: "p-2", outcomeType: "money_yearly", medianAmount: 200 }),
      peer({ playbookId: "p-3", outcomeType: "money_once", medianAmount: 300 }),
    ];

    // $40/month is $480/year, above all three peers → the top.
    expect(outcomeStrength(self({ medianAmount: 40 }), peers)).toBe(1);
    // $10/month is $120/year, above only the $100 one.
    expect(outcomeStrength(self({ medianAmount: 10 }), peers)).toBeCloseTo(1 / 3, 10);
  });

  it("excludes itself from its own peer set", () => {
    const peers = [peer({ playbookId: "p-1", medianAmount: 8.33 })];
    // The caller passes a catalogue that may include self; excluding it by id
    // is what stops a playbook from counting its own median as a peer.
    expect(outcomeStrength(self({ medianAmount: 8.33 }), peers)).toBe(0.5);
  });
});