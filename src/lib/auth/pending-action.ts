/**
 * The action a reader was trying to take when sign-in interrupted them.
 *
 * Stored as `{action, playbookId, returnTo, scrollY}` and put back afterwards,
 * so that asking someone to sign in costs them the thing they came to do. A
 * reader who tapped Save, got sent to a mailbox, came back and landed on the
 * homepage has been asked to do the Save twice, and most of them will not.
 *
 * ## Why it is carried in the callback URL as well as sessionStorage
 *
 * The brief says sessionStorage, and it is right for OAuth: the provider sends
 * the browser back to the same tab, which still has the entry.
 *
 * It is wrong for an email magic link. The link lives in a mail client, and
 * clicking it opens a *different* browsing context — a new tab, or a different
 * browser entirely, in which case the copy of the entry is gone and was never
 * even written. sessionStorage is per-context and does not travel with a link.
 *
 * So the pending action is encoded into `emailRedirectTo` as well, and the
 * callback route prefers the URL's copy. sessionStorage remains the fallback for
 * OAuth and for a reader who somehow arrives back in the original tab. Both
 * agree by construction because both are written at the same moment from the
 * same object.
 *
 * Deliberately no `"use client"` directive: the callback route reads this too,
 * and a server module may not import from a client one.
 */

export const PENDING_ACTION_KEY = "ph_pending_action";

/** What the reader was doing. Drives the sign-in modal's title. */
export const PENDING_ACTION_KINDS = ["save", "report", "create", "reminder"] as const;

export type PendingActionKind = (typeof PENDING_ACTION_KINDS)[number];

export type PendingAction = {
  action: PendingActionKind;
  /** Null for "create a playbook", which is not about one playbook. */
  playbookId: string | null;
  /** Absolute path to come back to. Same-origin only — never a full URL. */
  returnTo: string;
  /** Where on that page they were. Restored by the landing page, not here. */
  scrollY: number;
};

/**
 * A same-origin path, or "/".
 *
 * The value is written into a link that leaves the site, so it is treated as
 * untrusted on the way back in as well: an absolute URL, a protocol-relative
 * `//evil.test` and a `javascript:` URL are all things a hand-edited link could
 * carry, and following one after sign-in is the easiest open redirect there is.
 */
export function safeReturnTo(value: unknown, fallback = "/"): string {
  if (typeof value !== "string") return fallback;
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  // Backslash is normalised to a slash by several browsers, so "/\evil.test"
  // is a protocol-relative URL wearing a different hat.
  if (value.includes("\\")) return fallback;
  return value;
}

export function isPendingActionKind(value: unknown): value is PendingActionKind {
  return typeof value === "string" && (PENDING_ACTION_KINDS as readonly string[]).includes(value);
}

/* -------------------------------------------------------------------------- */
/* Encoding                                                                   */
/* -------------------------------------------------------------------------- */

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));

  return new TextDecoder().decode(bytes);
}

/**
 * The action as a query-string value, or null when it is not encodable.
 *
 * Null rather than a throw, because the only caller is building a URL that has
 * to work whether or not this succeeds: an action that cannot be encoded simply
 * does not get resumed, which is a smaller failure than a broken sign-in link.
 */
export function encodePendingAction(action: PendingAction): string | null {
  try {
    return toBase64Url(JSON.stringify(action));
  } catch {
    return null;
  }
}

/**
 * The action carried by a URL, or null.
 *
 * Every field is validated on the way back in. The value round-tripped through
 * an email client and a query string, and a malformed one must be discarded
 * rather than half-applied — a pending action with a `playbookId` from nobody's
 * URL would save the wrong playbook.
 */
export function decodePendingAction(value: unknown): PendingAction | null {
  if (typeof value !== "string" || value === "") return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(fromBase64Url(value));
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) return null;

  const candidate = parsed as Record<string, unknown>;
  if (!isPendingActionKind(candidate.action)) return null;

  const playbookId =
    typeof candidate.playbookId === "string" && candidate.playbookId !== ""
      ? candidate.playbookId
      : null;

  const scrollY =
    typeof candidate.scrollY === "number" && Number.isFinite(candidate.scrollY)
      ? Math.max(0, Math.min(Math.round(candidate.scrollY), 10_000_000))
      : 0;

  return {
    action: candidate.action,
    playbookId,
    returnTo: safeReturnTo(candidate.returnTo),
    scrollY,
  };
}

/* -------------------------------------------------------------------------- */
/* sessionStorage                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Remember what the reader was doing.
 *
 * Never throws. Private browsing and a full quota both make `sessionStorage`
 * unusable, and losing the resume is a worse outcome than an exception here.
 */
export function rememberPendingAction(action: PendingAction): void {
  try {
    window.sessionStorage.setItem(PENDING_ACTION_KEY, JSON.stringify(action));
  } catch {
    // No storage. The action still completes through the URL copy for a magic
    // link; only the in-tab OAuth resume is lost.
  }
}

/**
 * Read the pending action from sessionStorage, or null.
 *
 * The stored JSON is re-encoded so it goes through the *same* validator the URL
 * copy uses. That is the point: two validators for one payload is how a URL
 * resume and a session resume drift apart until only one of them still works,
 * and the one that stops working is always the one that needs a live mail client
 * to test.
 */
export function readPendingAction(): PendingAction | null {
  try {
    const raw = window.sessionStorage.getItem(PENDING_ACTION_KEY);
    if (!raw) return null;

    return decodePendingAction(toBase64Url(raw));
  } catch {
    return null;
  }
}

export function clearPendingAction(): void {
  try {
    window.sessionStorage.removeItem(PENDING_ACTION_KEY);
  } catch {
    // Nothing to clear.
  }
}