/**
 * Reading the local Mailpit inbox, so a test can follow a real sign-in link.
 *
 * The brief is explicit that password-only sessions do not satisfy the P8
 * acceptance criteria: the flow has to be the one a reader gets, which is a
 * link in an email. That means the test has to be able to *read the email* and
 * then *navigate the link*, because asserting on the inbox alone proves the mail
 * was sent and nothing about whether the link works.
 *
 * Mailpit is a local SMTP sink Supabase ships with; it keeps messages in memory
 * and exposes them on an HTTP API, so nothing has to be parsed off a socket.
 * Nothing is deleted between runs — every lookup is scoped to one recipient
 * address, and each run signs in with an address it has not used before.
 */

const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";

type MailpitMessage = {
  ID: string;
  Subject: string;
  To: { Address: string }[];
  Created: string;
};

/**
 * The body endpoint renames `Created` to `Date` — the header date the sender
 * chose, which is not necessarily when Mailpit received it. `latestMessageTo`
 * copies the list endpoint's `Created` back in so there is one field name here,
 * and so "arrived after the click" means received rather than sent.
 */
type MailpitFullMessage = Omit<MailpitMessage, "Created"> & {
  Date: string;
  Created: string;
  Text: string;
  HTML: string;
};

/** Whether Mailpit is up. Tests that need it skip rather than fail when it is not. */
export async function mailpitReachable(): Promise<boolean> {
  try {
    const response = await fetch(`${MAILPIT}/api/v1/messages?limit=1`);
    return response.ok;
  } catch {
    return false;
  }
}

async function messagesFor(address: string): Promise<MailpitMessage[]> {
  const response = await fetch(`${MAILPIT}/api/v1/messages?limit=200`);
  if (!response.ok) return [];

  const body = (await response.json()) as { messages?: MailpitMessage[] };

  return (body.messages ?? []).filter((message) =>
    message.To.some((to) => to.Address.toLowerCase() === address.toLowerCase()),
  );
}

async function full(message: MailpitMessage): Promise<MailpitFullMessage | null> {
  const response = await fetch(`${MAILPIT}/api/v1/message/${message.ID}`);
  if (!response.ok) return null;

  const body = (await response.json()) as Omit<MailpitFullMessage, "Created">;
  return { ...body, Created: message.Created };
}

/**
 * The most recent message to `address`, or null.
 *
 * "Most recent" rather than "first match", because Supabase reuses addresses
 * across the desktop and mobile projects in one `pnpm test:e2e` run: both run
 * against the same local stack, and the mobile run would otherwise pick up the
 * link the desktop run already consumed.
 */
export async function latestMessageTo(address: string): Promise<MailpitFullMessage | null> {
  const found = await messagesFor(address);
  if (found.length === 0) return null;

  const newest = [...found].sort((a, b) => b.Created.localeCompare(a.Created))[0]!;
  return full(newest);
}

/**
 * Every URL in a message body, plain text first.
 *
 * Order matters and is not cosmetic. GoTrue's HTML template puts the link in an
 * `href`, where `&` is written `&amp;`, so the URL scraped out of the HTML has
 * its parameters named `amp;type` and `amp;redirect_to` — a link GoTrue accepts
 * the token from and then rejects with "Verify requires a verification type".
 * The text part is the same link unescaped, so it is the one to use, and the
 * HTML entities are decoded here for the templates that only ship HTML.
 */
export function linksIn(message: MailpitFullMessage): string[] {
  const pattern = /https?:\/\/[^\s"'<>]+/g;
  const decode = (value: string) => value.replace(/&amp;/g, "&");

  const urls = [
    ...(message.Text.match(pattern) ?? []),
    ...(message.HTML.match(pattern) ?? []).map(decode),
  ];

  return [...new Set(urls)];
}

/**
 * Wait for a sign-in link addressed to `address`.
 *
 * Mail delivery through GoTrue is not instantaneous even locally, so this polls
 * rather than sleeping once. `notBefore` skips anything that arrived before the
 * click, which is what stops a re-run from signing in with a stale link.
 */
export async function waitForSignInLink(
  address: string,
  notBefore: Date,
  timeoutMs = 30_000,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  let seen = "";

  while (Date.now() < deadline) {
    const message = await latestMessageTo(address);

    if (message) {
      // Never the URL itself: it carries a single-use credential, and a test
      // failure is the most likely thing to end up pasted into a chat or a bug
      // report. The path and the parameter names are enough to debug with.
      seen = `${new Date(message.Created).toISOString()} ${linksIn(message)
        .map((url) => `${url.split("?")[0]} [${[...url.matchAll(/[?&]([a-z_]+)=/g)].map((m) => m[1]).join(",")}]`)
        .join(" ")}`;
    }

    if (message && new Date(message.Created).getTime() >= notBefore.getTime() - 5_000) {
      const link = linksIn(message).find((url) => url.includes("/auth/v1/verify"));
      if (link) return link;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(
    `No sign-in link reached ${address} within ${timeoutMs}ms. Latest: ${seen || "(no message)"}`,
  );
}
