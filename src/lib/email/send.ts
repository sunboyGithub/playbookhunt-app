import "server-only";

import { getEnv } from "@/lib/env";
import type { RenderedEmail } from "@/lib/email/templates";

/**
 * Send one transactional email through Resend's HTTP API.
 *
 * A hand-rolled `fetch` rather than the `resend` SDK, for the same reason as
 * the templates: the dependency has not been approved yet, and this is one POST
 * to a documented endpoint. Swapping it later touches this file alone.
 *
 * Returns what happened rather than throwing. The caller's real job is "did this
 * follow-up go out", and the difference between *Resend refused* and *we never
 * tried* is the difference between retrying and marking the row done forever —
 * so the reason is returned and never swallowed.
 */
export async function sendEmail(
  email: RenderedEmail & { to: string },
): Promise<{ sent: boolean; id?: string; reason?: string }> {
  const env = getEnv();

  if (!env.RESEND_API_KEY) {
    return { sent: false, reason: "RESEND_API_KEY is not set" };
  }

  if (!env.RESEND_FROM) {
    return { sent: false, reason: "RESEND_FROM is not set" };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.RESEND_FROM,
        to: [email.to],
        subject: email.subject,
        html: email.html,
        text: email.text,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return {
        sent: false,
        // Truncated: an error body can be a whole HTML page, and it ends up in
        // a log line somebody has to read.
        reason: `${response.status}: ${body.slice(0, 200)}`,
      };
    }

    const body = (await response.json().catch(() => null)) as { id?: string } | null;
    return { sent: true, id: body?.id };
  } catch (error) {
    return { sent: false, reason: error instanceof Error ? error.message : "unknown error" };
  }
}