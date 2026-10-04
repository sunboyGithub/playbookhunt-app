import { describe, expect, it } from "vitest";

import {
  escapeHtml,
  renderFollowUpEmail,
  renderMagicLinkEmail,
  safeUrl,
} from "@/lib/email/templates";

/**
 * Two things can go wrong in an email template that cannot go wrong anywhere
 * else in the app, so both are tested here directly.
 *
 * **Injection.** A playbook title is content an author typed and a playbook slug
 * is a URL segment. Both reach a mail client rendered with our domain on it, and
 * markup injection into somebody's inbox is a phishing tool that inherits our
 * reputation.
 *
 * **A dead button.** Outlook does not honour `padding` on an anchor, which is why
 * these are table cells — and the failure mode of getting that wrong is an email
 * that reads fine everywhere except the one client that makes it look like an
 * attack.
 */

const input = {
  playbookTitle: "Lower your internet bill",
  workedUrl: "https://playbookhunt.test/report/respond?token=AAA.111",
  partlyUrl: "https://playbookhunt.test/report/respond?token=BBB.222",
  didntUrl: "https://playbookhunt.test/report/respond?token=CCC.333",
  playbookUrl: "https://playbookhunt.test/p/lower-your-internet-bill",
  unsubscribeUrl: "https://playbookhunt.test/unsubscribe?token=DDD.444",
};

describe("escapeHtml", () => {
  it("escapes every character that can change a document's structure", () => {
    expect(escapeHtml(`<a href="x" onclick='y'>&`)).toBe(
      "&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;",
    );
  });

  it("escapes the ampersand first, so entities are not double-formed", () => {
    expect(escapeHtml("&lt;")).toBe("&amp;lt;");
  });

  it("leaves ordinary text alone", () => {
    expect(escapeHtml("Lower your internet bill")).toBe("Lower your internet bill");
  });
});

describe("safeUrl", () => {
  it("allows http and https", () => {
    expect(safeUrl("https://playbookhunt.test/x")).toBe("https://playbookhunt.test/x");
    expect(safeUrl("http://playbookhunt.test/x")).toBe("http://playbookhunt.test/x");
  });

  it("refuses javascript:, data: and everything else", () => {
    // A `javascript:` href in a mail client is a script in somebody's message
    // view with our domain attached to it.
    expect(safeUrl("javascript:alert(1)")).toBe("");
    expect(safeUrl("data:text/html,<script>alert(1)</script>")).toBe("");
    expect(safeUrl("mailto:someone@evil.test")).toBe("");
    expect(safeUrl("vbscript:msgbox(1)")).toBe("");
  });

  it("refuses anything that is not a URL at all", () => {
    expect(safeUrl("/p/some-playbook")).toBe("");
    expect(safeUrl("not a url")).toBe("");
    expect(safeUrl("")).toBe("");
  });
});

describe("renderFollowUpEmail", () => {
  it("puts all three answers in the HTML, each as its own link", () => {
    const { html } = renderFollowUpEmail(input);

    expect(html).toContain("It worked");
    expect(html).toContain("Partly worked");
    expect(html).toContain("It didn&#39;t work");
    expect(html).toContain(input.workedUrl);
    expect(html).toContain(input.partlyUrl);
    expect(html).toContain(input.didntUrl);
  });

  it("leads with the positive answer", () => {
    // A form that leads with the negative collects failures. The order is only
    // fair because all three are the same size and one tap away — which is also
    // why the test checks all three exist rather than only that "worked" is
    // first.
    const { html } = renderFollowUpEmail(input);
    const worked = html.indexOf("It worked");
    const partly = html.indexOf("Partly worked");
    const didnt = html.indexOf("It didn&#39;t work");

    expect(worked).toBeGreaterThan(-1);
    expect(worked).toBeLessThan(partly);
    expect(partly).toBeLessThan(didnt);
  });

  it("offers an unsubscribe in the HTML, not only in the text part", () => {
    // Most mail clients render one alternative and never show the other. An
    // unsubscribe hidden in the text version is one most readers will not find.
    const { html } = renderFollowUpEmail(input);
    expect(html).toContain("Stop these emails");
    expect(html).toContain(input.unsubscribeUrl);
  });

  it("offers an unsubscribe in the text part too", () => {
    const { text } = renderFollowUpEmail(input);
    expect(text).toContain(input.unsubscribeUrl);
  });

  it("names the playbook in the subject and the heading", () => {
    const { subject, html } = renderFollowUpEmail(input);
    expect(subject).toBe('Did "Lower your internet bill" work for you?');
    expect(html).toContain("Lower your internet bill");
  });

  it("escapes a title containing markup", () => {
    const { subject, html, text } = renderFollowUpEmail({
      ...input,
      playbookTitle: '<img src=x onerror="alert(1)">',
    });

    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x");
    // The text part is plain text, so it is not escaped — but it must still not
    // be able to become markup if a client guesses wrong about the part.
    expect(subject).toContain('<img src=x onerror="alert(1)">');
    expect(text).toContain("<img src=x");
  });

  it("renders a hostile URL as plain text instead of as a working button", () => {
    const { html } = renderFollowUpEmail({
      ...input,
      workedUrl: 'javascript:alert("xss")',
    });

    expect(html).not.toContain('href="javascript:');
    // The label and the raw value are still visible, so the reader can see what
    // was supposed to be there rather than finding a button that does nothing.
    expect(html).toContain("It worked");
  });

  it("builds each button as a table cell, which is what Outlook needs", () => {
    const { html } = renderFollowUpEmail(input);
    expect(html).toContain('<table role="presentation"');
    expect(html).toContain('cellpadding="0"');
  });

  it("lays out in tables rather than in divs", () => {
    const { html } = renderFollowUpEmail(input);

    // The divs that remain are the hidden preheader and two fixed-height
    // spacers between the buttons — neither carries layout. What must not exist
    // is a *sized* div, because Outlook renders those at their intrinsic width
    // and the whole card collapses.
    expect(html).not.toMatch(/<div[^>]*(width|max-width|background)/i);
    expect(html).toContain('width="100%"');
  });

  it("carries no recipient address or user id anywhere", () => {
    const { html, text } = renderFollowUpEmail(input);
    expect(html).not.toMatch(/@/);
    expect(text).not.toMatch(/@/);
  });
});

describe("renderMagicLinkEmail", () => {
  it("renders the link as a button and repeats it in the text part", () => {
    const url = "https://playbookhunt.test/auth/callback?code=abc";
    const { subject, html, text } = renderMagicLinkEmail({ url });

    expect(subject).toContain("sign-in link");
    expect(html).toContain(url);
    expect(text).toContain(url);
  });

  it("refuses to render a javascript: link as a button", () => {
    const { html } = renderMagicLinkEmail({ url: "javascript:alert(1)" });
    expect(html).not.toContain('href="javascript:');
  });
});