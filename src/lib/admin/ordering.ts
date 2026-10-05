/**
 * Ordering for the hand-arranged lists: collections and use cases.
 *
 * Both are "a list an administrator arranged, in an order that means something" —
 * a starter kit that begins with the thing you do first is a different thing
 * from the same kit in alphabetical order. So the order is stored as an explicit
 * `sort` integer rather than left to the order rows happen to arrive in, and
 * moving an item is a write of the whole list rather than an arithmetic patch to
 * one row.
 *
 * The consequence is that every write has to answer the same question: is this
 * submitted order a *reordering of the list as it stands*, or something else?
 * A list that loses an item, gains one, or repeats one is not an order — it is a
 * different list, and applying it would silently remove a playbook from a public
 * page or add the same one twice. That check is here, pure and tested, rather
 * than at each of the two call sites.
 */

export type OrderError =
  | { ok: false; error: "unknown-item" | "missing-item" | "duplicate-item"; item?: string };

export type OrderResult = { ok: true; order: string[] } | OrderError;

/**
 * Validate a submitted order against the rows that exist.
 *
 * Two orders are rejected rather than repaired, on purpose. Silently dropping an
 * id a caller sent would mean a form posting a stale list quietly unpublishes
 * whatever it left out; silently adding a missing one would mean a stale form
 * re-publishes something that was deliberately removed. Both would be worse
 * than refusing, because both look like success.
 */
export function normalizeOrder(submitted: readonly string[], current: readonly string[]): OrderResult {
  const currentSet = new Set(current);
  const seen = new Set<string>();

  for (const id of submitted) {
    if (!currentSet.has(id)) {
      return { ok: false, error: "unknown-item", item: id };
    }
    if (seen.has(id)) {
      return { ok: false, error: "duplicate-item", item: id };
    }
    seen.add(id);
  }

  for (const id of current) {
    if (!seen.has(id)) {
      return { ok: false, error: "missing-item", item: id };
    }
  }

  return { ok: true, order: [...submitted] };
}

/**
 * Move one item and return the new order.
 *
 * For the up/down controls, which is the interaction that works on a keyboard
 * and on a phone — a drag handle that cannot be reached by keyboard is not an
 * ordering tool, it is a picture of one.
 *
 * `delta` is -1 or +1; anything else is a no-op rather than an error, because the
 * buttons at the ends of the list are disabled and this is the belt to that
 * braces.
 */
export function moveItem(order: readonly string[], id: string, delta: number): string[] {
  const next = [...order];
  const from = next.indexOf(id);
  const to = from + Math.sign(delta);

  if (from === -1 || to < 0 || to >= next.length) {
    return next;
  }

  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return next;
}