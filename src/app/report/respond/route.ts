import { NextResponse, type NextRequest } from "next/server";

import { getEnv } from "@/lib/env";
import { verifyFollowupToken } from "@/lib/followups/token";
import { createAdminClient } from "@/lib/supabase/admin";
import { nowMs } from "@/server/clock";

/**
 * Where a follow-up email's three buttons land.
 *
 * A Route Handler rather than a page, because the right outcome is a redirect
 * and only a handler can produce one without a client-side hop. One tap in the
 * mail client, one 302, and the reader is on the real form with the answer
 * already selected.
 *
 * ## Nothing is written here
 *
 * An email-scanner follows every link in every message, from a mail provider's
 * own infrastructure, within seconds of delivery. So a GET here that filed a
 * report would file one on the reader's behalf before they read a word of the
 * email — and a scanner is indistinguishable from the reader as far as this
 * route can tell. The token only carries the *question*, and the answer is
 * still given by a person clicking a button on a form.
 *
 * The one thing that is recorded is that the link was opened, which is a fact
 * about the reminder rather than about the report. It is written with a filter
 * that matches nothing unless the row is still open, so clicking twice is
 * harmless and a link reopened after the reader already reported changes
 * nothing.
 */

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const payload = verifyFollowupToken(token);
  const siteUrl = getEnv().NEXT_PUBLIC_SITE_URL;

  if (!payload) {
    // Expired, forged or malformed. A rendered page rather than a redirect,
    // because there is nowhere useful to send somebody holding a dead link —
    // and "that link has expired" is more use than a bounce off the homepage.
    return NextResponse.redirect(new URL("/report/expired", request.nextUrl.origin));
  }

  const admin = createAdminClient();
  const { data: playbook } = await admin
    .from("playbooks")
    .select("id, slug")
    .eq("id", payload.playbookId)
    .maybeSingle();

  if (!playbook) {
    return NextResponse.redirect(new URL("/report/expired", request.nextUrl.origin));
  }

  await admin
    .from("followups")
    .update({ completed_at: new Date(nowMs()).toISOString() })
    .eq("id", payload.followupId)
    .is("completed_at", null);

  const target = new URL(`/p/${playbook.slug}/report`, siteUrl);
  target.searchParams.set("result", payload.result);

  // Absolute, from the configured site URL rather than the request's origin:
  // behind a proxy the request origin can be the internal hostname, and a
  // redirect there sends the reader's browser somewhere they cannot see.
  return NextResponse.redirect(target);
}