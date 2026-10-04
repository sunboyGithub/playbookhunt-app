import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * These tokens are the entire authority behind a "did it work?" link that works
 * without a session, so every test below is about the ways one can be forged,
 * replayed after it should have expired, or used to do more than it says.
 *
 * `getEnv()` is uncached by design, so setting the variables in `beforeEach` is
 * enough — no module reset, and no leaking a test secret into the app.
 */

const SECRET = "test-followup-secret-not-used-anywhere-else";

/**
 * `getEnv()` validates the whole schema on every call, not just the key being
 * read, so the three required public keys have to be present even though this
 * module only ever asks for `FOLLOWUP_SECRET`. Setting them here rather than
 * stubbing `getEnv` keeps the real validation in the path under test.
 */
beforeEach(() => {
  process.env.FOLLOWUP_SECRET = SECRET;
  process.env.NEXT_PUBLIC_SITE_URL = "https://playbookhunt.test";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
  delete process.env.RESEND_API_KEY;
});

afterEach(() => {
  delete process.env.FOLLOWUP_SECRET;
});

async function load() {
  return import("@/lib/followups/token");
}

describe("follow-up tokens", () => {
  it("round-trips a payload", async () => {
    const { createFollowupToken, verifyFollowupToken } = await load();

    const token = createFollowupToken({
      followupId: "a2c4f6e8-1111-4222-8333-444455556666",
      playbookId: "0f8fad5b-d9cb-469f-a165-70867728950e",
      result: "worked",
    });

    const payload = verifyFollowupToken(token);
    expect(payload).toMatchObject({
      followupId: "a2c4f6e8-1111-4222-8333-444455556666",
      playbookId: "0f8fad5b-d9cb-469f-a165-70867728950e",
      result: "worked",
    });
  });

  it("carries all three results and nothing else", async () => {
    const { createFollowupToken, verifyFollowupToken } = await load();

    for (const result of ["worked", "partly", "didnt"] as const) {
      const token = createFollowupToken({ followupId: "f", playbookId: "p", result });
      expect(verifyFollowupToken(token)?.result).toBe(result);
    }
  });

  it("refuses a token whose payload was edited", async () => {
    // The obvious forgery: re-encode the body with a different result, keeping
    // the signature. This is the case a MAC exists for.
    const { createFollowupToken, verifyFollowupToken } = await load();

    const token = createFollowupToken({ followupId: "f", playbookId: "p", result: "didnt" });
    const [body, signature] = token.split(".");

    const decoded = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    decoded.result = "worked";
    const forged = `${Buffer.from(JSON.stringify(decoded), "utf8").toString("base64url")}.${signature}`;

    expect(verifyFollowupToken(forged)).toBeNull();
    expect(verifyFollowupToken(token)?.result).toBe("didnt");
  });

  it("refuses a token signed with a different secret", async () => {
    const { createFollowupToken, verifyFollowupToken } = await load();

    const token = createFollowupToken({ followupId: "f", playbookId: "p", result: "worked" });

    process.env.FOLLOWUP_SECRET = "a-completely-different-secret-value-here";
    expect(verifyFollowupToken(token)).toBeNull();
  });

  it("refuses a truncated or extended signature", async () => {
    const { createFollowupToken, verifyFollowupToken } = await load();

    const token = createFollowupToken({ followupId: "f", playbookId: "p", result: "worked" });
    const [body, signature] = token.split(".");

    expect(verifyFollowupToken(`${body}.${signature.slice(0, -2)}`)).toBeNull();
    expect(verifyFollowupToken(`${body}.${signature}AA`)).toBeNull();
    expect(verifyFollowupToken(body)).toBeNull();
    expect(verifyFollowupToken(`${body}.`)).toBeNull();
  });

  it("refuses malformed input without throwing", async () => {
    const { verifyFollowupToken } = await load();

    for (const value of ["", ".", "..", "a.b.c", "not-a-token", "%%%%.%%%%"]) {
      expect(verifyFollowupToken(value)).toBeNull();
    }
    expect(verifyFollowupToken(null)).toBeNull();
    expect(verifyFollowupToken(undefined)).toBeNull();
  });

  it("expires after 14 days", async () => {
    const { createFollowupToken, verifyFollowupToken, FOLLOWUP_TOKEN_TTL_MS } = await load();

    expect(FOLLOWUP_TOKEN_TTL_MS).toBe(14 * 86_400_000);

    const justInside = createFollowupToken({
      followupId: "f",
      playbookId: "p",
      result: "worked",
      expiresAt: Date.now() + 60_000,
    });
    expect(verifyFollowupToken(justInside)).not.toBeNull();

    const justOutside = createFollowupToken({
      followupId: "f",
      playbookId: "p",
      result: "worked",
      expiresAt: Date.now() - 1,
    });
    expect(verifyFollowupToken(justOutside)).toBeNull();
  });

  it("gives every reason the same answer, so it cannot be used as an oracle", async () => {
    const { createFollowupToken, verifyFollowupToken } = await load();
    const token = createFollowupToken({ followupId: "f", playbookId: "p", result: "worked" });
    const [, signature] = token.split(".");

    // Forged and expired must be indistinguishable to a caller: both null, so
    // there is nothing to learn from the difference beyond "no".
    const forged = verifyFollowupToken(`abc.${signature}`);
    const expired = verifyFollowupToken(
      createFollowupToken({
        followupId: "f",
        playbookId: "p",
        result: "worked",
        expiresAt: Date.now() - 1,
      }),
    );

    expect(forged).toBeNull();
    expect(expired).toBeNull();
  });

  it("refuses a payload whose result is not one of the three", async () => {
    const { verifyFollowupToken } = await load();

    // Signed with the real secret, so only the shape check can catch this. It is
    // checked because the payload comes from a query string.
    const { createHmac } = await import("node:crypto");
    const body = {
      followupId: "f",
      playbookId: "p",
      result: "excellent",
      expiresAt: Date.now() + 1000,
    };
    const encoded = Buffer.from(JSON.stringify(body), "utf8").toString("base64url");
    const signature = createHmac("sha256", SECRET).update(encoded).digest("base64url");

    expect(verifyFollowupToken(`${encoded}.${signature}`)).toBeNull();
  });

  it("verifies nothing at all when no secret is configured", async () => {
    const { createFollowupToken, verifyFollowupToken } = await load();
    const token = createFollowupToken({ followupId: "f", playbookId: "p", result: "worked" });

    // The alternative — accept anything so a fresh checkout works — makes a
    // missing secret into a way to file reports for anybody.
    delete process.env.FOLLOWUP_SECRET;
    expect(verifyFollowupToken(token)).toBeNull();
  });

  it("refuses to mint when no secret is configured", async () => {
    const { createFollowupToken } = await load();
    delete process.env.FOLLOWUP_SECRET;

    expect(() => createFollowupToken({ followupId: "f", playbookId: "p", result: "worked" })).toThrow(
      /FOLLOWUP_SECRET/,
    );
  });
});

describe("unsubscribe tokens", () => {
  it("round-trips a user id", async () => {
    const { createUnsubscribeToken, verifyUnsubscribeToken } = await load();

    const token = createUnsubscribeToken("0f8fad5b-d9cb-469f-a165-70867728950e");
    expect(verifyUnsubscribeToken(token)?.userId).toBe("0f8fad5b-d9cb-469f-a165-70867728950e");
  });

  it("cannot be a follow-up token, even a valid one", async () => {
    // This is the whole reason it is a separate type. If one token could do both,
    // any link that leaked out of an email body could also switch off somebody's
    // mail — a much broader claim than "answer this one question".
    const { createFollowupToken, createUnsubscribeToken, verifyFollowupToken, verifyUnsubscribeToken } =
      await load();

    const followup = createFollowupToken({ followupId: "f", playbookId: "p", result: "worked" });
    expect(verifyUnsubscribeToken(followup)).toBeNull();

    const unsubscribe = createUnsubscribeToken("user-1");
    expect(verifyFollowupToken(unsubscribe)).toBeNull();
  });

  it("refuses a forged or expired one", async () => {
    const { createUnsubscribeToken, verifyUnsubscribeToken } = await load();

    const token = createUnsubscribeToken("user-1");
    const [body, signature] = token.split(".");

    const decoded = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    decoded.userId = "somebody-else";
    const forged = `${Buffer.from(JSON.stringify(decoded), "utf8").toString("base64url")}.${signature}`;

    expect(verifyUnsubscribeToken(forged)).toBeNull();
    expect(verifyUnsubscribeToken(createUnsubscribeToken("user-1", -1))).toBeNull();
    expect(verifyUnsubscribeToken(token)).not.toBeNull();
  });

  it("refuses a body that decodes to something else entirely", async () => {
    const { createHmac } = await import("node:crypto");
    const { verifyUnsubscribeToken } = await load();

    const encoded = Buffer.from(JSON.stringify({ hello: "world" }), "utf8").toString("base64url");
    const signature = createHmac("sha256", SECRET).update(encoded).digest("base64url");

    expect(verifyUnsubscribeToken(`${encoded}.${signature}`)).toBeNull();
  });
});