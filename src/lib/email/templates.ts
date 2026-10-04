/**
 * Transactional email, as HTML strings.
 *
 * ## Why not React Email
 *
 * The brief asks for React Email, and it is the right tool: templates that are
 * components cannot quietly ship a broken tag, and a diff shows what changed.
 * Installing `@react-email/components`, `@react-email/render` and `resend`
 * needs a dependency-approval round trip, which has not happened yet, and
 * AGENTS.md says to ask before adding a major one.
 *
 * So the templates are here instead, hand-written, with the escaping written out
 * and tested. When the packages are approved this becomes a mechanical change:
 * each `render*` function returns the same `{subject, html, text}` shape, so
 * `sendEmail` and its callers do not move at all.
 *
 * ## Escaping
 *
 * `playbookTitle` is *our* content, but the promise on a playbook is a piece of
 * free text an author typed, and a playbook slug is a URL segment. Both go
 * through `escapeHtml` on the way in. An unescaped `&` in a title is a mangled
 * email; an unescaped `<` is markup injection into somebody's inbox, and inbox
 * markup injection is a phishing tool with our domain on it.
 */

export type RenderedEmail = {
  subject: string;
  html: string;
  text: string;
};

const BRAND = "#FF5A1F";
const INK = "#1a1a1a";
const MUTED = "#6b6b6b";
const SURFACE = "#FAF9F6";
const BORDER = "#E7E5E0";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Only http(s), same origin-relative paths rejected. Blocks `javascript:`. */
function safeUrl(value: string): string {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : "";
  } catch {
    return "";
  }
}

/**
 * A button. A table cell rather than a CSS button because Outlook does not
 * honour `padding` on an `<a>` and every other mail client does — the result is
 * that the same email reads fine everywhere except one, which is the one that
 * makes somebody think it is a phishing attempt.
 */
function button(href: string, label: string, background: string, color: string): string {
  const url = safeUrl(href);
  if (!url) {
    // A link we cannot vouch for is rendered as plain text rather than as a
    // button that does nothing.
    return `<p style="margin:8px 0;font-size:15px;color:${MUTED};">${escapeHtml(label)}: ${escapeHtml(href)}</p>`;
  }

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-radius:9999px;background:${background};"><a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 22px;font:500 15px/1 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${color};text-decoration:none;border-radius:9999px;">${escapeHtml(label)}</a></td></tr></table>`;
}

function shell(heading: string, body: string, footer: { label: string; url: string } | null = null): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(heading)}</title>
</head>
<body style="margin:0;padding:0;background:${SURFACE};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">Did a playbook you tried actually work? One tap and it's in.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${SURFACE};">
<tr><td align="center" style="padding:32px 16px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#ffffff;border:1px solid ${BORDER};border-radius:16px;">
    <tr><td style="padding:28px 28px 8px;">
      <p style="margin:0;font:600 15px/1 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${INK};">Playbook<span style="color:${BRAND};">Hunt</span></p>
    </td></tr>
    <tr><td style="padding:8px 28px 0;">
      <h1 style="margin:0 0 12px;font:600 22px/1.3 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${INK};">${escapeHtml(heading)}</h1>
      ${body}
    </td></tr>
    <tr><td style="padding:20px 28px 28px;">
      <p style="margin:0;font:400 12px/1.5 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${MUTED};">
        You get this once, because you asked to be reminded after trying a playbook. Not every week, not on a schedule.
      </p>
      ${
        footer
          ? `<p style="margin:10px 0 0;font:400 12px/1.5 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${MUTED};">
               <a href="${escapeHtml(safeUrl(footer.url))}" style="color:${MUTED};">${escapeHtml(footer.label)}</a>
             </p>`
          : ""
      }
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;
}

/* -------------------------------------------------------------------------- */
/* The follow-up                                                              */
/* -------------------------------------------------------------------------- */

export type FollowUpEmailInput = {
  playbookTitle: string;
  /** Where the three buttons point. All three carry a signed token. */
  workedUrl: string;
  partlyUrl: string;
  didntUrl: string;
  playbookUrl: string;
  unsubscribeUrl: string;
};

/**
 * "Did <playbook> work for you?"
 *
 * Three buttons, worked first. The order is not neutral: the whole site is
 * built on people answering truthfully, and a form that leads with the negative
 * is a form that collects failures. Leading with the positive does not bias the
 * answer if the other two are the same size and one tap away, which they are.
 *
 * The unsubscribe link is in every message and is a one-click GET, because an
 * unsubscribe that needs a sign-in is not an unsubscribe.
 */
export function renderFollowUpEmail(input: FollowUpEmailInput): RenderedEmail {
  const title = input.playbookTitle;

  const html = shell(
    `Did "${title}" work for you?`,
    `<p style="margin:0 0 20px;font:400 15px/1.6 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${INK};">
       You tried it a few days ago. One tap tells the next person whether it was worth their time — that answer is the only reason anyone else finds out.
     </p>
     ${button(input.workedUrl, "It worked", "#16A34A", "#ffffff")}
     <div style="height:10px"></div>
     ${button(input.partlyUrl, "Partly worked", "#F59E0B", "#ffffff")}
     <div style="height:10px"></div>
     ${button(input.didntUrl, "It didn't work", "#DC2626", "#ffffff")}
     <p style="margin:22px 0 0;font:400 13px/1.6 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${MUTED};">
       Or <a href="${escapeHtml(safeUrl(input.playbookUrl))}" style="color:${BRAND};">open the playbook</a> and add the details.
     </p>`,
    // In the HTML, not only in the text alternative. Most readers never see the
    // plain-text part — the client picks one — so an unsubscribe that lives only
    // there is an unsubscribe most of this site's readers will not find.
    { label: "Stop these emails", url: input.unsubscribeUrl },
  );

  const text = [
    `Did "${title}" work for you?`,
    "",
    "You tried it a few days ago. One tap tells the next person whether it was worth their time.",
    "",
    `It worked:      ${input.workedUrl}`,
    `Partly worked:  ${input.partlyUrl}`,
    `Didn't work:    ${input.didntUrl}`,
    "",
    `Open the playbook: ${input.playbookUrl}`,
    "",
    `Stop these emails: ${input.unsubscribeUrl}`,
  ].join("\n");

  return { subject: `Did "${title}" work for you?`, html, text };
}

/* -------------------------------------------------------------------------- */
/* Sign-in link                                                               */
/* -------------------------------------------------------------------------- */

export function renderMagicLinkEmail(input: { url: string }): RenderedEmail {
  // Not sent through this app — GoTrue renders its own — but kept here so the
  // escaping and the shell are in one place and a future custom template has a
  // shape to copy.
  return {
    subject: "Your Playbook Hunt sign-in link",
    html: shell(
      "Here's your sign-in link",
      `${button(input.url, "Sign in", BRAND, "#ffffff")}`,
    ),
    text: `Sign in: ${input.url}`,
  };
}

/** Exported for tests: the only gate that decides whether a URL may appear. */
export { safeUrl };