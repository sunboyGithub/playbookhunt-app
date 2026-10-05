/**
 * `outcomeStrength` — where this playbook's median sits among its category.
 *
 * The term answers "is this worth more than its neighbours", so it has to be
 * comparable before it can be a percentile. Two playbooks can both report
 * saving money and mean different things by it: $40/month off a phone bill and
 * $4,000/year off a car loan are not the same saving, and neither is smaller.
 * So money is normalised to a per-year figure first.
 *
 * Time is not normalised at all, and hours are only ever compared with hours.
 * There is no defensible exchange rate between an hour saved and a dollar, and
 * inventing one would let a time playbook out-rank a money one on the strength
 * of a number chosen here.
 */

import { MIN_OUTCOME_PEERS } from "@/config/ranking";
import type { PeerStat } from "@/lib/ranking/types";
import type { OutcomeType } from "@/lib/report/shape";

/**
 * The unit class a playbook's outcome is measured in.
 *
 * Money and time never mix. Binary playbooks have no amount at all and belong
 * to neither, so they are excluded from every percentile pool.
 */
export type OutcomeClass = "money" | "time";

export function outcomeClass(outcomeType: OutcomeType): OutcomeClass | null {
  if (outcomeType === "time_hours") return "time";
  if (outcomeType === "money_monthly" || outcomeType === "money_yearly" || outcomeType === "money_once") {
    return "money";
  }
  return null;
}

/**
 * A median restated in comparable terms: dollars per year for money, hours for
 * time. Null when there is nothing to restate.
 *
 * `money_monthly` × 12; `money_yearly` and `money_once` as they are. `money_once`
 * is left alone on purpose — a one-off saving is not an annual saving, but it
 * is money the reader kept, and dividing an unknown period by twelve would
 * invent a rate nobody reported.
 */
export function comparableMedian(
  medianAmount: number | null,
  outcomeType: OutcomeType,
): number | null {
  if (medianAmount === null || !Number.isFinite(medianAmount)) return null;

  if (outcomeType === "money_monthly") return medianAmount * 12;
  if (outcomeType === "money_yearly" || outcomeType === "money_once") return medianAmount;
  // Hours are already in their own unit; there is nothing to convert them to and
  // nothing to convert them from.
  if (outcomeType === "time_hours") return medianAmount;
  return null;
}

/**
 * Where `value` sits among `peers`: `(below + 0.5 × equal) / total`.
 *
 * The midpoint rank rather than "fraction below", so that a playbook tied with
 * half the category gets the middle of the category rather than the bottom of
 * it. With ties being common — several playbooks can share a median — the
 * alternative would quietly penalise every tied playbook for the ties of others.
 */
export function percentileOf(value: number, peers: readonly number[]): number {
  if (peers.length === 0) return 0.5;

  let below = 0;
  let equal = 0;

  for (const peer of peers) {
    if (peer < value) below += 1;
    else if (peer === value) equal += 1;
  }

  return (below + 0.5 * equal) / peers.length;
}

/**
 * `outcomeStrength(playbook, categoryPeers)`, in [0, 1].
 *
 * Returns the neutral 0.5 whenever the answer is not knowable: no median, a
 * binary playbook, no comparable peers, or fewer than `MIN_OUTCOME_PEERS` of
 * them. Neutral rather than zero, because "we cannot tell" should not push a
 * playbook down the list — that would make an unmeasured playbook rank below a
 * measured bad one, which is the exact inversion the brief is guarding against.
 */
export function outcomeStrength(
  self: Pick<PeerStat, "playbookId" | "outcomeType" | "medianAmount" | "amountN">,
  categoryPeers: readonly PeerStat[],
): number {
  if (self.amountN < 5) return 0.5;
  if (outcomeClass(self.outcomeType) === null) return 0.5;

  const mine = comparableMedian(self.medianAmount, self.outcomeType);
  if (mine === null) return 0.5;

  const klass = outcomeClass(self.outcomeType);

  const peers = categoryPeers
    .filter((peer) => peer.playbookId !== self.playbookId)
    .filter((peer) => peer.amountN >= 5)
    .filter((peer) => outcomeClass(peer.outcomeType) === klass)
    .map((peer) => comparableMedian(peer.medianAmount, peer.outcomeType))
    .filter((value): value is number => value !== null);

  if (peers.length < MIN_OUTCOME_PEERS) return 0.5;

  return percentileOf(mine, peers);
}