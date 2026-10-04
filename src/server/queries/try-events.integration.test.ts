import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";

import { insertTryEvent, type TryEventClient } from "./try-events";
import type { Database } from "@/lib/database.types";

/**
 * `try_events` against local Supabase, for an anonymous reader and a signed-in
 * one.
 *
 * This is the one test in the suite that needs a database, and it is why the
 * insert was pulled out of `logTryEvent`: the rules that matter here are RLS
 * rules, and RLS is only real against a running Postgres. Asserting them
 * against a mock would only assert that the mock is correct.
 *
 * It writes with the *anon* key, because that is the key the server action uses.
 * A service-role write would bypass every policy under test and pass whether or
 * not RLS is right. The service role is used only to read rows back, because
 * `try_events` grants select to admins only.
 *
 * Skipped, not failed, when local Supabase is not running — `pnpm test` has to
 * stay runnable without a database. The e2e suite covers the same rows through
 * the real server action, and that suite already requires the stack.
 */

try {
  process.loadEnvFile(".env.local");
} catch {
  // No env file: the suite skips below.
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

let admin: SupabaseClient<Database> | null = null;
let playbookId = "";
let museAgentId: string | null = null;
let userId: string | null = null;
/** A real signed-in user's access token, or null if the account could not be made. */
let userToken: string | null = null;
let ready = false;

function anonClient(accessToken?: string): TryEventClient {
  return createClient<Database>(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    ...(accessToken ? { global: { headers: { Authorization: `Bearer ${accessToken}` } } } : {}),
  });
}

/**
 * Setup runs at module scope rather than in a `beforeAll`, because
 * `describe.skipIf` is evaluated while the file is collected — which happens
 * before any hook. A readiness flag set in `beforeAll` would still read `false`
 * at that point, and the suite would skip silently on every run.
 */
if (supabaseUrl && anonKey && serviceKey) {
  const service = createClient<Database>(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: playbook } = await service
    .from("playbooks")
    .select("id")
    .eq("slug", "lower-your-internet-bill")
    .maybeSingle();

  if (playbook) {
    playbookId = playbook.id as string;

    const { data: agent } = await service
      .from("agents")
      .select("id")
      .eq("slug", "muse")
      .maybeSingle();

    museAgentId = (agent?.id as string | undefined) ?? null;
    admin = service;

    // A throwaway account, so the signed-in case is a real session with a real
    // JWT rather than a hand-written `user_id` on an anon client — which RLS
    // would reject, correctly, and which would therefore test nothing.
    const email = `try-event-${crypto.randomUUID()}@example.test`;
    const password = crypto.randomUUID();

    const { data: created, error } = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (!error && created.user) {
      userId = created.user.id;
      const { data: session } = await anonClient().auth.signInWithPassword({
        email,
        password,
      });
      userToken = session.session?.access_token ?? null;
    }

    ready = Boolean(userToken);
  }
}

/** Narrowed for the assertions. The suite is skipped when this is null. */
function service(): SupabaseClient<Database> {
  if (!admin) {
    throw new Error("local Supabase is unavailable");
  }

  return admin;
}

/** Ids this suite created, so cleanup removes exactly those rows. */
const created: string[] = [];

async function cleanup() {
  if (admin && created.length > 0) {
    await admin.from("try_events").delete().in("id", created);
    created.length = 0;
  }
}

async function insert(row: Parameters<typeof insertTryEvent>[1]) {
  const result = await insertTryEvent(anonClient(row.userId ? (userToken as string) : undefined), row);

  if (result.id) {
    created.push(result.id);
  }

  return result;
}

afterAll(cleanup);

describe.skipIf(!ready)("try_events against local Supabase", () => {
  it("records an anonymous try with a device id and no user", async () => {
    const result = await insert({
      playbookId,
      agentSlug: "muse",
      userId: null,
      deviceId: crypto.randomUUID(),
      action: "copied",
    });

    expect(result.id).not.toBeNull();

    const { data } = await service()
      .from("try_events")
      .select("action, user_id, device_id, agent_id, playbook_id")
      .eq("id", result.id as string)
      .single();

    expect(data).toMatchObject({
      action: "copied",
      // The whole design: an anonymous try is still countable.
      user_id: null,
      playbook_id: playbookId,
      // Resolved from the slug server-side, not taken from the caller's word.
      agent_id: museAgentId,
    });
    expect(typeof data?.device_id).toBe("string");
  });

  it("records a signed-in try against that user", async () => {
    const result = await insert({
      playbookId,
      agentSlug: "muse",
      userId,
      deviceId: crypto.randomUUID(),
      action: "started",
    });

    expect(result.id).not.toBeNull();

    const { data } = await service()
      .from("try_events")
      .select("action, user_id")
      .eq("id", result.id as string)
      .single();

    expect(data).toMatchObject({ action: "started", user_id: userId });
  });

  it("refuses a user_id that is not the caller's own", async () => {
    const result = await insertTryEvent(anonClient(userToken as string), {
      playbookId,
      // A forged id belonging to somebody else. RLS rejects the insert rather
      // than rewriting it, so this returns null and no row exists — without
      // the policy, P8's "Tried" tab would show one person's activity under
      // another's account and the follow-up would be emailed to them.
      userId: crypto.randomUUID(),
      deviceId: crypto.randomUUID(),
      action: "opened",
    });

    expect(result.id).toBeNull();
  });

  it("refuses to attribute a try to a user while signed out", async () => {
    const result = await insertTryEvent(anonClient(), {
      playbookId,
      userId: crypto.randomUUID(),
      deviceId: crypto.randomUUID(),
      action: "copied",
    });

    // The anonymous case, which is the one that needs no account to attempt.
    expect(result.id).toBeNull();
  });

  it("records 'no agent' for a slug that does not exist", async () => {
    const result = await insert({
      playbookId,
      agentSlug: "not-a-real-agent",
      deviceId: crypto.randomUUID(),
      action: "copied",
    });

    expect(result.id).not.toBeNull();

    const { data } = await service()
      .from("try_events")
      .select("agent_id")
      .eq("id", result.id as string)
      .single();

    // A stale or hand-edited slug must not fail the insert: the try still
    // happened and still counts.
    expect(data?.agent_id).toBeNull();
  });

  it("stores no prompt content", async () => {
    const result = await insert({
      playbookId,
      deviceId: crypto.randomUUID(),
      action: "copied",
    });

    expect(result.id).not.toBeNull();

    const { data } = await service().from("try_events").select("*").eq("id", result.id as string).single();

    // Asserted against the stored row rather than against the type, so a new
    // column holding prompt text would fail here instead of passing quietly.
    expect(Object.keys(data ?? {}).sort()).toEqual([
      "action",
      "agent_id",
      "created_at",
      "device_id",
      "id",
      "playbook_id",
      "user_id",
      "version_id",
    ]);
  });

  it("does not let a reader read try events, signed in or not", async () => {
    await insert({ playbookId, deviceId: crypto.randomUUID(), action: "copied" });

    // The anon key with no session.
    const { data, error } = await anonClient()
      .from("try_events")
      .select("id")
      .eq("playbook_id", playbookId);

    expect(error).toBeNull();
    expect(data).toEqual([]);

    // And a signed-in reader still cannot read *anyone's* events, their own
    // included: `try_events` grants select to admins only.
    const { data: ownRows, error: ownError } = await anonClient(userToken as string)
      .from("try_events")
      .select("id")
      .eq("playbook_id", playbookId);

    expect(ownError).toBeNull();
    expect(ownRows).toEqual([]);
  });
});