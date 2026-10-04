import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { EnvError, getEnv } from "@/lib/env";

const VALID_ENV = {
  NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
} as const;

const MANAGED_KEYS = [
  "NEXT_PUBLIC_SITE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "RESEND_API_KEY",
  "NEXT_PUBLIC_POSTHOG_KEY",
  "SENTRY_DSN",
] as const;

let originalEnv: Record<string, string | undefined>;

beforeEach(() => {
  originalEnv = {};
  for (const key of MANAGED_KEYS) {
    originalEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of MANAGED_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
});

describe("getEnv", () => {
  it("returns the validated environment when required keys are present", () => {
    for (const [key, value] of Object.entries(VALID_ENV)) {
      process.env[key] = value;
    }

    const env = getEnv();

    expect(env.NEXT_PUBLIC_SITE_URL).toBe("http://localhost:3000");
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe("http://127.0.0.1:54321");
    expect(env.NEXT_PUBLIC_SUPABASE_ANON_KEY).toBe("anon-key");
  });

  it("treats service-role, Resend, PostHog and Sentry as optional", () => {
    for (const [key, value] of Object.entries(VALID_ENV)) {
      process.env[key] = value;
    }

    const env = getEnv();

    expect(env.SUPABASE_SERVICE_ROLE_KEY).toBeUndefined();
    expect(env.RESEND_API_KEY).toBeUndefined();
    expect(env.NEXT_PUBLIC_POSTHOG_KEY).toBeUndefined();
    expect(env.SENTRY_DSN).toBeUndefined();
  });

  it("throws EnvError naming every missing required key", () => {
    expect(() => getEnv()).toThrow(EnvError);

    try {
      getEnv();
      expect.unreachable("getEnv should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(EnvError);
      const { missing } = error as EnvError;
      expect(missing).toContain("NEXT_PUBLIC_SUPABASE_URL");
      expect(missing).toContain("NEXT_PUBLIC_SUPABASE_ANON_KEY");
      expect(missing).toContain("NEXT_PUBLIC_SITE_URL");
      // Optional keys must not be reported as missing.
      expect(missing).not.toContain("RESEND_API_KEY");
      expect(missing).not.toContain("SENTRY_DSN");
    }
  });

  it("rejects a malformed URL rather than passing it through", () => {
    for (const [key, value] of Object.entries(VALID_ENV)) {
      process.env[key] = value;
    }
    process.env.NEXT_PUBLIC_SUPABASE_URL = "not-a-url";

    expect(() => getEnv()).toThrow(EnvError);
  });

  it("treats an empty required value as missing", () => {
    for (const [key, value] of Object.entries(VALID_ENV)) {
      process.env[key] = value;
    }
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "";

    expect(() => getEnv()).toThrow(EnvError);
  });

  it("treats blank optional values as absent rather than invalid", () => {
    for (const [key, value] of Object.entries(VALID_ENV)) {
      process.env[key] = value;
    }
    // This is the shape of a fresh .env.local copied from .env.example: every
    // optional key is present but unfilled.
    process.env.RESEND_API_KEY = "";
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "";
    process.env.SENTRY_DSN = "";

    const env = getEnv();

    expect(env.RESEND_API_KEY).toBeUndefined();
    expect(env.NEXT_PUBLIC_POSTHOG_KEY).toBeUndefined();
    expect(env.SENTRY_DSN).toBeUndefined();
  });

  it("treats whitespace-only optional values as absent", () => {
    for (const [key, value] of Object.entries(VALID_ENV)) {
      process.env[key] = value;
    }
    process.env.SENTRY_DSN = "   ";

    expect(getEnv().SENTRY_DSN).toBeUndefined();
  });
});
