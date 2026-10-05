/**
 * Promote an account to administrator.
 *
 * The admin area is gated on `profiles.role = 'admin'`, and nothing in the app
 * can set that: there is deliberately no "sign up as admin" path, no role picker
 * on the profile page, and no admin action that grants roles. An administrator is
 * promoted out of band, with a script, by somebody with the service key.
 *
 * ## Why it takes an address and not a user id
 *
 * Because the address is what the person knows. You sign in with a magic link,
 * you have an address, and that is the only handle the founder has. The script
 * resolves it through the auth admin API rather than matching a profile row,
 * because `profiles` is publicly readable and must never hold an address.
 *
 * ## Why it refuses to run against a hosted database
 *
 * Promoting an account is a permanent, non-self-service grant of access to every
 * moderation queue, the audit log, and the ability to edit and publish any
 * playbook. Doing that against production by typing an address into a script is
 * the kind of thing that happens once, to a real account, and cannot be undone
 * from the UI. Local only; a real promotion is a deliberate SQL statement run by
 * somebody who intends it.
 *
 * ## The local flow this exists for
 *
 * ```
 * pnpm dev                      # 127.0.0.1:3000
 * # open http://127.0.0.1:54324, sign in with any address you control
 * # click the magic link Mailpit prints
 * pnpm db:promote-admin you@example.com
 * # open http://127.0.0.1:3000/admin
 * ```
 *
 * Promote *after* the first sign-in, not before: the profile row is created by
 * the first sign-in, and this script updates an existing one.
 */

import { createClient } from "@supabase/supabase-js";

import type { Database } from "../src/lib/database.types";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`${name} is not set. Run with --env-file=.env.local`);
  }
  return value;
}

function argument(): { email: string; revoke: boolean } {
  const args = process.argv.slice(2);
  const revoke = args.includes("--revoke");
  const value = args.find((arg) => !arg.startsWith("--"));

  if (!value) {
    throw new Error(
      "Usage: pnpm db:promote-admin [--revoke] you@example.com\n" +
        "Sign in with that address first — the profile row is created on first sign-in.",
    );
  }

  return { email: value.trim().toLowerCase(), revoke };
}

async function main() {
  const { email, revoke } = argument();
  const url = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");

  const host = new URL(url).hostname;
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(
      `Refusing to grant admin against ${url}. This grants full moderation and publishing ` +
        `access with no way to revoke it from the UI; promote a real administrator by hand, ` +
        `in SQL, on purpose.`,
    );
  }

  const supabase = createClient<Database>(url, serviceKey, {
    auth: { persistSession: false },
  });

  const { data, error: listError } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });

  if (listError) {
    throw new Error(`Could not read accounts: ${listError.message}`);
  }

  const user = data.users.find((candidate) => candidate.email?.toLowerCase() === email);

  if (!user) {
    throw new Error(
      `No account with ${email}. Sign in with it first — the magic link is in Mailpit at ` +
        `http://127.0.0.1:54324 — then run this again.`,
    );
  }

  const role = revoke ? "user" : "admin";

  const { error: profileError } = await supabase
    .from("profiles")
    .update({ role })
    .eq("id", user.id);

  if (profileError) {
    throw new Error(`Could not change the role: ${profileError.message}`);
  }

  const { error: readBack } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (readBack) {
    throw new Error(`Could not verify the change: ${readBack.message}`);
  }

  if (revoke) {
    console.log(`${email} (${user.id}) is a reader again. /admin returns a 404 for them.`);
    return;
  }

  console.log(`${email} (${user.id}) is now an administrator.`);
  console.log("Open /admin in the same browser. The nav appears on the next navigation.");
  console.log("To take it away again: pnpm db:promote-admin --revoke you@example.com");
}

await main();