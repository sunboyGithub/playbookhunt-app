/**
 * Analytics, thinly.
 *
 * A wrapper, not an SDK. Two reasons it is hand-written rather than
 * `posthog-js`: the brief asks for a thin wrapper, and the dependency rule in
 * AGENTS.md says ask before adding a major one — PostHog's SDK is a major one,
 * and a form-approval round trip is cheaper than a bundle that ships to every
 * reader whether or not anyone is watching.
 *
 * Behaviour without a key is a no-op, which is the required behaviour: local
 * development, CI and the Playwright suite all run with no key set and must not
 * make a network request, log a warning, or fail a test because analytics is not
 * configured.
 *
 * The snippet loader is injected once per page. Nothing here awaits it, so a
 * blocked or slow PostHog cannot delay an interaction — events are dropped
 * rather than queued, because a queued analytics event that arrives minutes
 * late describes a reader who has left.
 */

type EventName =
  | "search"
  | "filter_changed"
  | "card_click"
  | "share"
  | "request_submitted"
  | "report_opened"
  | "report_submitted";

type EventProps = Record<string, string | number | boolean | undefined>;

declare global {
  interface Window {
    posthog?: {
      capture: (event: string, properties?: Record<string, unknown>) => void;
    };
  }
}

/** The queue type is deliberately looser than `EventProps` so the SDK's own
 *  `Record<string, unknown>` signature can be satisfied from inside this file. */
type QueuedEvent = { event: string; properties: Record<string, unknown> };

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";

let snippetRequested = false;

function ensureLoaded(): void {
  if (!KEY || snippetRequested || typeof document === "undefined") {
    return;
  }

  snippetRequested = true;

  // Queue on the global until the real snippet arrives, so events fired during
  // page load are not simply lost.
  const queue: QueuedEvent[] = [];
  window.posthog = {
    capture: (event, properties) => {
      queue.push({ event, properties: properties ?? {} });
    },
  };

  const script = document.createElement("script");
  script.async = true;
  script.src = `${HOST}/static/array.js`;
  script.onload = () => {
    const posthog = window.posthog;
    if (!posthog) {
      return;
    }
    // The stub replaced the global; the snippet extends it in place.
    for (const queued of queue) {
      posthog.capture(queued.event, queued.properties);
    }
  };

  document.head.appendChild(script);
}

/**
 * Record an event.
 *
 * Call sites pass only what the page already shows the reader. No email, no
 * query text, no pathname with a query string — AGENTS.md forbids PII in
 * analytics events, and a search term is frequently someone's own finances
 * ("lower my overdraft") rather than something they chose to publish.
 *
 * So `q` is only ever sent as a length. What someone searched for is not
 * recorded; how much they typed is.
 */
export function track(event: EventName, properties: EventProps = {}): void {
  if (!KEY || typeof window === "undefined") {
    return;
  }

  ensureLoaded();

  // Undefined values would be sent as null and read back as "present but null",
  // which is a different question from "not sent".
  const clean = Object.fromEntries(
    Object.entries(properties).filter(([, value]) => value !== undefined),
  );

  window.posthog?.capture(event, clean);
}

/**
 * Which filter changed, for the `filter_changed` event.
 *
 * The facet name and its new value only — never the full resulting URL, which
 * would carry the query string along with it.
 */
export function trackFilterChanged(facet: string, value: string): void {
  track("filter_changed", { facet, value });
}

/** A search. Length only; see the note on `track`. */
export function trackSearch(qLength: number, filters: string[]): void {
  track("search", { q_length: qLength, filters: filters.join(",") || undefined });
}

/** A result card, with its 1-based position on the page. */
export function trackCardClick(slug: string, position: number): void {
  track("card_click", { slug, position });
}

/**
 * A share, with the channel it went to.
 *
 * The slug is sent so the channel rates can be read per playbook; the shared
 * *URL* is not, because it is the same URL the reader is already on and a
 * referral-style parameter on it would turn an analytics event into a tracking
 * link. `copy` is a first-class channel here rather than a fallback: it is
 * often the most common outcome, and recording it as something else would make
 * every other channel look better than it is.
 */
export function trackShare(slug: string, channel: string): void {
  track("share", { slug, channel });
}
/**
 * The report form was opened.
 *
 * Only the playbook's outcome *type*, which is already printed on the page the
 * reader is looking at. Nothing about what they went on to type.
 */
export function trackReportOpened(outcomeType: string | null): void {
  track("report_opened", { outcome_type: outcomeType ?? undefined });
}

/**
 * A report was filed.
 *
 * The three properties the brief names: which of the three buttons, whether an
 * amount was given, whether a file was attached.
 *
 * Notably absent: the amount, the note, the referral code, the provider. All
 * four would be PII in a third-party analytics tool, and the amount in
 * particular is the single number this site exists to publish — a copy of it in
 * PostHog is a copy of it outside the database that governs it. `has_amount`
 * answers the question the funnel actually asks ("how many people will file a
 * number?") without carrying the number.
 */
export function trackReportSubmitted(input: {
  result: string;
  hasAmount: boolean;
  hasEvidence: boolean;
}): void {
  track("report_submitted", {
    result: input.result,
    has_amount: input.hasAmount,
    has_evidence: input.hasEvidence,
  });
}
