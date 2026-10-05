import { describe, expect, it } from "vitest";

import { moveItem, normalizeOrder } from "@/lib/admin/ordering";

/**
 * The guard on the two hand-arranged lists.
 *
 * Every assertion below is about a *refusal*. `normalizeOrder` is the reason a
 * stale form cannot quietly remove a playbook from a public page: applying a
 * submitted order that is not a permutation of the stored one would either drop
 * an item or re-add a deleted one, and both would look like success.
 */

const CURRENT = ["a", "b", "c"];

describe("normalizeOrder", () => {
  it("accepts the same list in the same order", () => {
    const result = normalizeOrder(["a", "b", "c"], CURRENT);

    expect(result).toEqual({ ok: true, order: ["a", "b", "c"] });
  });

  it("accepts a genuine reorder", () => {
    const result = normalizeOrder(["c", "a", "b"], CURRENT);

    expect(result).toEqual({ ok: true, order: ["c", "a", "b"] });
  });

  it("accepts an empty list when the stored list is empty", () => {
    expect(normalizeOrder([], [])).toEqual({ ok: true, order: [] });
  });

  it("refuses an item that is not in the list", () => {
    // The dangerous direction: repairing this by dropping the unknown id would
    // unpublish the rows that were not sent.
    const result = normalizeOrder(["a", "b", "zzz"], CURRENT);

    expect(result).toEqual({ ok: false, error: "unknown-item", item: "zzz" });
  });

  it("refuses a list that dropped an item", () => {
    // And repairing this by adding the missing row back would re-publish
    // something an administrator deliberately took out.
    const result = normalizeOrder(["a", "b"], CURRENT);

    expect(result).toEqual({ ok: false, error: "missing-item", item: "c" });
  });

  it("refuses the same item twice", () => {
    const result = normalizeOrder(["a", "a", "b", "c"], CURRENT);

    expect(result).toEqual({ ok: false, error: "duplicate-item", item: "a" });
  });

  it("refuses an empty submission for a non-empty list", () => {
    expect(normalizeOrder([], CURRENT)).toMatchObject({ ok: false, error: "missing-item" });
  });

  it("does not mutate the stored list", () => {
    const current = [...CURRENT];
    normalizeOrder(["c", "b", "a"], current);

    expect(current).toEqual(["a", "b", "c"]);
  });

  it("returns a copy rather than the submitted array", () => {
    const submitted = ["a", "b", "c"];
    const result = normalizeOrder(submitted, CURRENT);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.order).not.toBe(submitted);
    }
  });
});

describe("moveItem", () => {
  it("moves an item up", () => {
    expect(moveItem(CURRENT, "c", -1)).toEqual(["a", "c", "b"]);
  });

  it("moves an item down", () => {
    expect(moveItem(CURRENT, "a", 1)).toEqual(["b", "a", "c"]);
  });

  it("does nothing at the top", () => {
    expect(moveItem(CURRENT, "a", -1)).toEqual(CURRENT);
  });

  it("does nothing at the bottom", () => {
    expect(moveItem(CURRENT, "c", 1)).toEqual(CURRENT);
  });

  it("ignores an id that is not in the list", () => {
    expect(moveItem(CURRENT, "zzz", -1)).toEqual(CURRENT);
  });

  it("does not mutate its input", () => {
    const order = [...CURRENT];
    moveItem(order, "a", 1);

    expect(order).toEqual(CURRENT);
  });

  it("only ever produces a permutation of what it was given", () => {
    for (let index = 0; index < CURRENT.length; index += 1) {
      for (const delta of [-1, 1]) {
        const moved = moveItem(CURRENT, CURRENT[index]!, delta);

        expect([...moved].sort()).toEqual([...CURRENT].sort());
        // Which is the property that means a moved list still passes
        // `normalizeOrder`, and so still saves.
        expect(normalizeOrder(moved, CURRENT).ok).toBe(true);
      }
    }
  });
});