import { NextResponse, type NextRequest } from "next/server";

import { verifyUnsubscribeToken } from "@/lib/followups/token";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * One-click unsubscribe.
 *
 * A Route Handler, not a page, for the same reason the follow-up links are one:
 * the reader clicked a link in an email and the correct outcome is a page that
 * says it worked, not a form asking them to confirm they meant it.
 *
 * ## Why the service-role client
 *
 * The write is `reminders_enabled = false` on somebody's profile, and the
 * request carries no session — it carries a *signature*, which is the same
 * thing for this purpose but is checked here rather than by Postgres. The
 * service role is used because there is no `auth.uid()` for RLS to compare
 * against: without a session the request is anonymous, and an anonymous caller
 * cannot write to a profile at all. The token is the authorisation, and it is
 * verified before anything is written.
 *
 * ## The second link
 *
 * A confirmed unsubscribe page carries "actually, turn them back on" pointing at
 * `/me?tab=settings`. People click unsubscribe by accident, and a preference
 * they cannot reverse without an email is a preference they will not trust in the
 * first place.
 */

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const payload = verifyUnsubscribeToken(token);

  if (!payload) {
    return confirmation({
      ok: false,
      heading: "That link has expired",
      body: "Unsubscribe links last 14 days. You can turn reminders off from My playbooks at any time — it takes one click there too.",
    });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ reminders_enabled: false })
    .eq("id", payload.userId);

  if (error) {
    return confirmation({
      ok: false,
      heading: "That didn't work",
      body: "We couldn't record it. Try again in a moment, or turn reminders off from My playbooks.",
    });
  }

  return confirmation({
    ok: true,
    heading: "Done — no more reminder emails",
    body: "We'll stop sending the one-off \"did it work?\" follow-ups. Everything else about the site is unchanged.",
  });
}

function confirmation({ ok, heading, body }: { ok: boolean; heading: string; body: string }) {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${heading}</title>
<meta name="robots" content="noindex,nofollow">
</head>
<body style="margin:0;background:#FAF9F6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a;">
  <main style="max-width:520px;margin:0 auto;padding:64px 24px;text-align:center;">
    <h1 style="font-size:24px;font-weight:600;letter-spacing:-0.01em;margin:0 0 12px;">${heading}</h1>
    <p style="font-size:15px;line-height:1.6;color:#6b6b6b;margin:0;">${body}</p>
    <p style="margin-top:28px;">
      <a href="/me?tab=settings" style="display:inline-block;padding:12px 22px;border-radius:9999px;background:${
        ok ? "#1a1a1a" : "#FF5A1F"
      };color:#ffffff;font-size:15px;font-weight:500;text-decoration:none;">My playbooks → Settings</a>
    </p>
  </main>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}