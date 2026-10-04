import { z } from "zod";

/**
 * Environment validation, run at startup so a misconfigured deploy fails loudly
 * instead of surfacing as a runtime error deep inside a request.
 *
 * Only the keys the app cannot boot without are required. Service-role,
 * Resend, PostHog and Sentry arrive later in the build (P2, P8, P11) and stay
 * optional until something actually reads them.
 */
const serverSchema = z.object({
  NEXT_PUBLIC_SITE_URL: z.url(),

  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),

  // Server-only. Never exposed to the browser.
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),

  // Shared secret Vercel Cron sends as `Authorization: Bearer …`. Absent means
  // the follow-up route refuses every request, which is the safe default: an
  // unauthenticated cron route is an open relay for the whole site's mail.
  CRON_SECRET: z.string().min(1).optional(),

  // Signs the one-click links in a follow-up email. Separate from
  // CRON_SECRET because the two have different blast radii: this one is
  // embedded in a URL that ends up in inboxes, webcrawlers and clipboard
  // history, and rotating the cron secret should not invalidate a week of
  // outstanding reminders.
  FOLLOWUP_SECRET: z.string().min(1).optional(),

  // Verified sender for every transactional email.
  RESEND_FROM: z.string().min(1).optional(),

  // Arriving in later prompts.
  RESEND_API_KEY: z.string().min(1).optional(),
  NEXT_PUBLIC_POSTHOG_KEY: z.string().min(1).optional(),
  SENTRY_DSN: z.string().min(1).optional(),
});

export type Env = z.infer<typeof serverSchema>;

/**
 * Thrown when the environment is incomplete. The message names every missing
 * key so setup failures are fixable without reading the schema.
 */
export class EnvError extends Error {
  readonly missing: string[];

  constructor(missing: string[]) {
    super(
      `Missing required environment variables: ${missing.join(", ")}. ` +
        `Copy .env.example to .env.local and fill in the values.`,
    );
    this.name = "EnvError";
    this.missing = missing;
  }
}

/**
 * Reads an env var, treating a blank value as absent.
 *
 * `.env.local` files list every key with a trailing `=`, which the runtime
 * surfaces as an empty string rather than undefined. Without this, an optional
 * key that has not been filled in yet would fail `.min(1)` and take down the
 * whole app.
 */
function read(key: string): string | undefined {
  const value = process.env[key];
  return value === undefined || value.trim() === "" ? undefined : value;
}

const KEYS = [
  "NEXT_PUBLIC_SITE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "CRON_SECRET",
  "FOLLOWUP_SECRET",
  "RESEND_FROM",
  "RESEND_API_KEY",
  "NEXT_PUBLIC_POSTHOG_KEY",
  "SENTRY_DSN",
] as const;

const REQUIRED_KEYS = [
  "NEXT_PUBLIC_SITE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
] as const;

function collectMissing(): string[] {
  return REQUIRED_KEYS.filter((key) => read(key) === undefined);
}

/**
 * Validated server-side environment. Safe to call from server components,
 * server actions and middleware. Throws {@link EnvError} if required keys are
 * absent.
 *
 * Deliberately not cached: it reads fresh values so a changed `.env.local`
 * takes effect without a restart during development.
 */
export function getEnv(): Env {
  const missing = collectMissing();
  if (missing.length > 0) throw new EnvError(missing);

  const raw: Record<string, unknown> = {};
  for (const key of KEYS) raw[key] = read(key);

  const parsed = serverSchema.safeParse(raw);

  if (!parsed.success) {
    const keys = parsed.error.issues.map((issue) => issue.path.join("."));
    throw new EnvError([...new Set(keys)]);
  }

  return parsed.data;
}

/** Public subset, safe to pass to client components. */
export type PublicEnv = Pick<
  Env,
  "NEXT_PUBLIC_SITE_URL" | "NEXT_PUBLIC_SUPABASE_URL" | "NEXT_PUBLIC_SUPABASE_ANON_KEY"
>;
