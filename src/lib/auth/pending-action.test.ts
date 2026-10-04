import { describe, expect, it } from "vitest";

import {
  PENDING_ACTION_KINDS,
  clearPendingAction,
  decodePendingAction,
  encodePendingAction,
  isPendingActionKind,
  readPendingAction,
  rememberPendingAction,
  safeReturnTo,
  type PendingAction,
} from "@/lib/auth/pending-action";

/**
 * These two functions are the whole of the "come back to what you were doing"
 * mechanism, and both are reachable from outside: `pa` rides in the magic link's
 * `emailRedirectTo`, and `next` is on `/login`. So the interesting cases are all
 * adversarial.
 */

const action: PendingAction = {
  action: "save",
  playbookId: "0f8fad5b-d9cb-469f-a165-70867728950e",
  returnTo: "/p/lower-your-internet-bill",
  scrollY: 480,
};

describe("encodePendingAction / decodePendingAction", () => {
  it("round-trips every kind", () => {
    for (const kind of PENDING_ACTION_KINDS) {
      const encoded = encodePendingAction({ ...action, action: kind });
      expect(encoded).not.toBeNull();
      expect(decodePendingAction(encoded)).toEqual({ ...action, action: kind });
    }
  });

  it("is URL-safe", () => {
    const encoded = encodePendingAction(action) as string;
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    // The value is embedded in a query string. `+`, `/` and `=` each need
    // escaping there, which is exactly what base64url avoids.
    expect(encoded).not.toMatch(/[+/=]/);
  });

  it("returns null for anything that is not one of our tokens", () => {
    expect(decodePendingAction("")).toBeNull();
    expect(decodePendingAction("not base64!!")).toBeNull();
    expect(decodePendingAction(null)).toBeNull();
    expect(decodePendingAction(undefined)).toBeNull();
    expect(decodePendingAction(42)).toBeNull();
  });

  it("returns null rather than throwing on base64 that decodes to garbage", () => {
    expect(decodePendingAction("bm90IEpTT04")).toBeNull();
    expect(decodePendingAction("W10")).toBeNull(); // "[]"
    expect(decodePendingAction("bnVsbA")).toBeNull(); // "null"
  });

  it("rejects an unknown action instead of guessing", () => {
    const forged = btoa(JSON.stringify({ ...action, action: "become-admin" }));
    expect(decodePendingAction(forged)).toBeNull();
  });

  it("drops a returnTo that is not a local path but keeps the action", () => {
    const forged = btoa(JSON.stringify({ ...action, returnTo: "https://evil.test/steal" }));
    const decoded = decodePendingAction(forged);

    // The action survives; the destination does not. Losing the resume is a
    // smaller failure than keeping the feature and opening a redirect hole.
    expect(decoded?.action).toBe("save");
    expect(decoded?.returnTo).toBe("/");
  });

  it("clamps a scroll position instead of trusting it", () => {
    const forged = btoa(JSON.stringify({ ...action, scrollY: -50 }));
    expect(decodePendingAction(forged)?.scrollY).toBe(0);

    const huge = btoa(JSON.stringify({ ...action, scrollY: 9e12 }));
    expect(decodePendingAction(huge)?.scrollY).toBe(10_000_000);

    const nonsense = btoa(JSON.stringify({ ...action, scrollY: "far down" }));
    expect(decodePendingAction(nonsense)?.scrollY).toBe(0);
  });

  it("treats an empty playbookId as null rather than as a lookup", () => {
    const forged = btoa(JSON.stringify({ ...action, playbookId: "" }));
    expect(decodePendingAction(forged)?.playbookId).toBeNull();
  });
});

describe("safeReturnTo", () => {
  it("keeps local paths", () => {
    expect(safeReturnTo("/p/lower-your-internet-bill")).toBe("/p/lower-your-internet-bill");
    expect(safeReturnTo("/me?tab=settings")).toBe("/me?tab=settings");
    expect(safeReturnTo("/")).toBe("/");
  });

  it("refuses absolute, protocol-relative and script URLs", () => {
    expect(safeReturnTo("https://evil.test")).toBe("/");
    expect(safeReturnTo("http://evil.test")).toBe("/");
    expect(safeReturnTo("//evil.test")).toBe("/");
    expect(safeReturnTo("javascript:alert(1)")).toBe("/");
    expect(safeReturnTo("me?tab=settings")).toBe("/");
  });

  it("refuses a backslash, which several browsers normalise to a slash", () => {
    // "/\evil.test" is a protocol-relative URL wearing a different hat: Chrome
    // and Firefox both treat the backslash as "/" when parsing.
    expect(safeReturnTo("/\\evil.test")).toBe("/");
    expect(safeReturnTo("\\\\evil.test")).toBe("/");
  });

  it("refuses anything that is not a string", () => {
    expect(safeReturnTo(undefined)).toBe("/");
    expect(safeReturnTo(null)).toBe("/");
    expect(safeReturnTo(["/p/x"])).toBe("/");
    expect(safeReturnTo(42)).toBe("/");
  });

  it("uses the caller's fallback when given one", () => {
    expect(safeReturnTo("https://evil.test", "/me")).toBe("/me");
  });
});

describe("isPendingActionKind", () => {
  it("accepts exactly the four kinds", () => {
    expect(isPendingActionKind("save")).toBe(true);
    expect(isPendingActionKind("report")).toBe(true);
    expect(isPendingActionKind("create")).toBe(true);
    expect(isPendingActionKind("reminder")).toBe(true);
  });

  it("refuses everything else", () => {
    expect(isPendingActionKind("Save")).toBe(false);
    expect(isPendingActionKind("delete")).toBe(false);
    expect(isPendingActionKind("")).toBe(false);
    expect(isPendingActionKind(undefined)).toBe(false);
    expect(isPendingActionKind(7)).toBe(false);
  });
});

describe("sessionStorage round-trip", () => {
  it("reads back what it wrote, through the same validator as the URL copy", () => {
    rememberPendingAction(action);
    expect(readPendingAction()).toEqual(action);
  });

  it("returns null rather than throwing when storage is unavailable", () => {
    const original = Object.getOwnPropertyDescriptor(window, "sessionStorage");

    Object.defineProperty(window, "sessionStorage", {
      configurable: true,
      get() {
        throw new Error("SecurityError: storage is disabled");
      },
    });

    expect(() => rememberPendingAction(action)).not.toThrow();
    expect(readPendingAction()).toBeNull();
    expect(() => clearPendingAction()).not.toThrow();

    if (original) Object.defineProperty(window, "sessionStorage", original);
  });

  it("discards a stored entry that would not survive the URL validator", () => {
    window.sessionStorage.setItem(
      "ph_pending_action",
      JSON.stringify({ ...action, returnTo: "https://evil.test" }),
    );
    expect(readPendingAction()?.returnTo).toBe("/");
    clearPendingAction();
  });
});