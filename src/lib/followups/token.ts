import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { getEnv } from "@/lib/env";
import type { ReportResult } from "@/lib/report/shape";

/**
 * The signed token behind a follow-up email's three one-click links.
 *
 * A reader who gets the email should be able to answer from their phone without
 * an account and without a session. That means the link has to carry its own
 * authority, which means it has to be signed — an unsigned `?result=worked` in a
 * URL is a link anyone can mint, and the "did it work?" answer is the number
 * this site publishes.
 *
 * ## What the token deliberately does not do
 *
 * **It does not authorise a report.** Reading the token back tells the report
 * page which button to press; filing anything still needs a signed-in reader
 * and goes through the same server action. So the worst a leaked token can do
 * is pre-select an answer, which the reader then sees and can change.
 *
 * **It expires.** Fourteen days, per the brief, which is long enough for
 * someone who filed a reminder away to find it later and short enough that a
 * link scraped out of an inbox archive is not a permanent capability. Expiry is
 * checked on the server, against the clock, and not trusted from the client.
 *
 * HMAC-SHA256, compared with `timingSafeEqual`. The comparison is constant-time
 * because a byte-at-a-time comparison of a MAC leaks the MAC, and a leaked MAC
 * is a forgeable token.
 */

/** 14 days, as the brief specifies. */
export const FOLLOWUP_TOKEN_TTL_MS = 14 * 86_400_000;

export type FollowupTokenPayload = {
  /** The follow-up row this link belongs to, so it can be recorded as used. */
  followupId: string;
  playbookId: string;
  result: ReportResult;
  /** Expiry, ms since the epoch. */
  expiresAt: number;
};

function secret(): string {
  const value = getEnv().FOLLOWUP_SECRET;
  if (!value) {
    throw new Error(
      "FOLLOWUP_SECRET is not set. One-click follow-up links cannot be signed without it.",
    );
  }
  return value;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function createFollowupToken(
  input: Omit<FollowupTokenPayload, "expiresAt"> & { expiresAt?: number },
): string {
  const body: FollowupTokenPayload = {
    followupId: input.followupId,
    playbookId: input.playbookId,
    result: input.result,
    expiresAt: input.expiresAt ?? Date.now() + FOLLOWUP_TOKEN_TTL_MS,
  };

  const encoded = Buffer.from(JSON.stringify(body), "utf8").toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

/**
 * Verify a token, or return null.
 *
 * Null for every failure — wrong signature, malformed, expired, wrong shape —
 * rather than a reason. A caller that can distinguish "expired" from "forged"
 * turns this into an oracle, and none of those distinctions change what the
 * caller should do.
 */
export function verifyFollowupToken(token: string | null | undefined): FollowupTokenPayload | null {
  if (!token) return null;

  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;

  let expected: string;
  try {
    expected = sign(encoded);
  } catch {
    // No secret configured. Nobody can have minted a valid token, so nothing
    // verifies — rather than falling back to "accept anything".
    return null;
  }

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);

  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) return null;

  const candidate = parsed as Record<string, unknown>;
  const result = candidate.result;

  if (
    typeof candidate.followupId !== "string" ||
    typeof candidate.playbookId !== "string" ||
    (result !== "worked" && result !== "partly" && result !== "didnt") ||
    typeof candidate.expiresAt !== "number"
  ) {
    return null;
  }

  if (candidate.expiresAt < Date.now()) return null;

  return {
    followupId: candidate.followupId,
    playbookId: candidate.playbookId,
    result,
    expiresAt: candidate.expiresAt,
  };
}
/* -------------------------------------------------------------------------- */
/* Unsubscribe                                                                */
/* -------------------------------------------------------------------------- */

/**
 * A one-click unsubscribe link.
 *
 * Its own token rather than a reuse of the follow-up one, because it carries a
 * *different* and much broader claim: not "this one reminder, this one answer"
 * but "stop emailing this person". A token type that could do both would mean any
 * link that leaked out of an inbox body could also switch off somebody's mail.
 *
 * Signed the same way and expiring on the same clock. The expiry is not what
 * makes unsubscribe safe — a reader clicking it in week three is exactly who it
 * is for — it is what stops a stale URL in a mailbox archive from being a
 * capability forever. Anyone who wants it changed later can do it from
 * `/me?tab=settings`.
 */
export type UnsubscribeTokenPayload = {
  userId: string;
  expiresAt: number;
};

export function createUnsubscribeToken(userId: string, ttlMs = FOLLOWUP_TOKEN_TTL_MS): string {
  const body: UnsubscribeTokenPayload = { userId, expiresAt: Date.now() + ttlMs };
  const encoded = Buffer.from(JSON.stringify(body), "utf8").toString("base64url");

  return `${encoded}.${sign(encoded)}`;
}

export function verifyUnsubscribeToken(
  token: string | null | undefined,
): UnsubscribeTokenPayload | null {
  if (!token) return null;

  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;

  let expected: string;
  try {
    expected = sign(encoded);
  } catch {
    return null;
  }

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);

  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  const candidate = parsed as Record<string, unknown> | null;
  if (
    !candidate ||
    typeof candidate.userId !== "string" ||
    typeof candidate.expiresAt !== "number" ||
    candidate.expiresAt < Date.now()
  ) {
    return null;
  }

  return { userId: candidate.userId, expiresAt: candidate.expiresAt };
}
