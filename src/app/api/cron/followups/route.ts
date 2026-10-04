import { NextResponse, type NextRequest } from "next/server";

import { createFollowupToken, createUnsubscribeToken } from "@/lib/followups/token";
import { sendEmail } from "@/lib/email/send";
import { renderFollowUpEmail } from "@/lib/email/templates";
import { getEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { nowMs } from "@/server/clock";

/**
 * The hourly "did it work?" job.
 *
 * Vercel Cron hits this with `Authorization: Bearer $CRON_SECRET`, which is
 * checked here rather than trusted from configuration. An unauthenticated cron
 * route is a public endpoint that emails this site's users on command, and the
 * one that is easiest to forget to protect is exactly this one, because nothing
 * in the browser ever calls it and so nothing about it looks like an attack
 * surface.
 *
 * ## No secret configured means nothing runs
 *
 * Absent `CRON_SECRET`, every request is refused. The alternative — allow when
 * unset, so a fresh checkout works — makes the *development* environment an open
 * mail relay and the production misconfiguration indistinguishable from it.
 * Local runs are triggered by hand with the secret from `.env.local`.
 *
 * ## Batching and the sent_at race
 *
 * Vercel can fire two overlapping runs. `sent_at` is only stamped *after* the
 * send succeeds, so a row cannot be marked "already sent" for mail that never
 * left. Two overlapping runs can therefore both pick up the same row and both
 * send it — which is why the update filters on `sent_at is null` and checks that
 * it actually changed a row. The second run's update matches nothing, so it
 * knows to stop. A reader occasionally getting two identical emails is a smaller
 * failure than a reminder that was marked sent and never arrived.
 */

export const dynamic = "force-dynamic";

/** How many to send in one pass. Resend and Postgres both have limits. */
const BATCH = 100;

/** Vercel Cron sends GET. POST is accepted too so a manual trigger is easy. */
export async function GET(request: NextRequest) {
  return run(request);
}

export async function POST(request: NextRequest) {
  return run(request);
}

async function run(request: NextRequest): Promise<NextResponse> {
  const env = getEnv();
  const secret = env.CRON_SECRET;

  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not set; the follow-up job is disabled." },
      { status: 503 },
    );
  }

  // The follow-up link's signing key, checked here rather than discovered
  // mid-batch. Without it `createFollowupToken` throws, and throwing inside the
  // loop turns a configuration mistake into a run that sends half its reminders
  // and reports a 500 — the reader gets a mail with a dead button in it.
  if (!env.FOLLOWUP_SECRET) {
    return NextResponse.json(
      { error: "FOLLOWUP_SECRET is not set; the follow-up job is disabled." },
      { status: 503 },
    );
  }

  // Constant-time-ish: a length mismatch short-circuits, which leaks only the
  // length, and the length of a secret is not the secret.
  const provided = request.headers.get("authorization") ?? "";
  if (provided !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const siteUrl = env.NEXT_PUBLIC_SITE_URL;

  const { data: due } = await admin
    .from("followups")
    .select("id, user_id, playbook_id")
    .is("sent_at", null)
    .is("completed_at", null)
    .lte("due_at", new Date(nowMs()).toISOString())
    .limit(BATCH);

  if (!due || due.length === 0) {
    return NextResponse.json({ considered: 0, sent: 0, skipped: 0, failed: 0 });
  }

  // One query for the playbooks rather than one per row: a batch of 100 would
  // otherwise be 100 round trips to render 100 subject lines.
  const playbookIds = [...new Set(due.map((row) => row.playbook_id))];
  const { data: playbooks } = await admin
    .from("playbooks")
    .select("id, slug, title")
    .in("id", playbookIds);

  const playbookById = new Map((playbooks ?? []).map((row) => [row.id, row]));

  const profileIds = [...new Set(due.map((row) => row.user_id))];
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, role")
    .in("id", profileIds);

  const optedOut = new Set(
    (profiles ?? []).filter((p) => (p as { reminders_enabled?: boolean }).reminders_enabled === false).map((p) => p.id),
  );

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of due) {
    const playbook = playbookById.get(row.playbook_id);
    if (!playbook) {
      skipped += 1;
      continue;
    }

    if (optedOut.has(row.user_id)) {
      // The reader turned reminders off after this was scheduled. The row stays
      // unsent and stays due, so it will be re-examined — and re-skipped — next
      // hour. That is cheap and it means turning reminders back on does not need
      // a backfill.
      skipped += 1;
      continue;
    }

    const { data: user } = await admin.auth.admin.getUserById(row.user_id);
    const address = user?.user?.email;
    if (!address) {
      skipped += 1;
      continue;
    }

    const link = (result: "worked" | "partly" | "didnt") =>
      `${siteUrl}/report/respond?token=${encodeURIComponent(
        createFollowupToken({ followupId: row.id, playbookId: row.playbook_id, result }),
      )}`;

    const email = renderFollowUpEmail({
      playbookTitle: String(playbook.title),
      playbookUrl: `${siteUrl}/p/${playbook.slug}`,
      workedUrl: link("worked"),
      partlyUrl: link("partly"),
      didntUrl: link("didnt"),
      // Per reader and signed, so the unsubscribe works without a session —
      // an unsubscribe that requires signing in is not an unsubscribe.
      unsubscribeUrl: `${siteUrl}/unsubscribe?token=${encodeURIComponent(
        createUnsubscribeToken(row.user_id),
      )}`,
    });

    const result = await sendEmail({ ...email, to: address });

    if (!result.sent) {
      failed += 1;
      // Not stamped, so the next run retries it. A row that permanently fails
      // keeps retrying, which is the intended failure: a reminder that did not
      // go out is better remembered than quietly dropped.
      continue;
    }

    // Claim the row. `is("sent_at", null)` is what makes a concurrent run lose.
    const { count } = await admin
      .from("followups")
      .update({ sent_at: new Date(nowMs()).toISOString() }, { count: "exact" })
      .eq("id", row.id)
      .is("sent_at", null);

    if ((count ?? 0) > 0) {
      sent += 1;
    } else {
      // Someone else got there first. Not a failure and not a second send we
      // need to apologise for — the mail did go out once.
      skipped += 1;
    }
  }

  return NextResponse.json({ considered: due.length, sent, skipped, failed });
}