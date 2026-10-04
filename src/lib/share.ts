/**
 * Share targets for the detail page.
 *
 * Pure URL builders, no DOM and no window, so they can be unit-tested — which
 * matters more here than it looks. A share URL is a string that leaves the site
 * and is very hard to notice being wrong: a `url=` parameter with a trailing
 * space still renders a link, it just posts a URL that resolves nowhere.
 *
 * The channel list is not symmetric and the asymmetry is not an oversight:
 *
 * - X, Facebook, Threads and WhatsApp have documented web intent URLs, so they
 *   work on desktop and on a phone alike.
 * - Instagram and TikTok have no share URL. Asking the platform to open a URL
 *   that does not exist produces either an error page or, worse, a composer
 *   with no text in it. So on mobile they hand off to the native share sheet —
 *   where the reader picks the app themselves, and the platform decides how to
 *   accept it — and on desktop they copy the link, which is the only thing that
 *   can actually work there.
 */

export type ShareChannel =
  | "x"
  | "instagram"
  | "threads"
  | "facebook"
  | "whatsapp"
  | "tiktok"
  | "copy";

export type ShareTarget = {
  channel: ShareChannel;
  label: string;
  /** `href` for a web intent. Null means "cannot be a link; use native or copy". */
  href: string | null;
  /**
   * Whether this channel must go through the native share sheet on a device
   * that has one. True only for the two platforms with no web intent.
   */
  nativeOnly: boolean;
};

/** Twitter's intent endpoint still lives on `twitter.com`; `x.com/intent` 404s. */
function xIntent(url: string, text: string): string {
  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
}

function facebookIntent(url: string): string {
  return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
}

/**
 * Threads' web intent. Documented by Meta as `threads.net/intent/post`; the
 * `text` parameter is not part of it, so the title travels as the shared text
 * instead of being encoded into the URL.
 */
function threadsIntent(url: string, text: string): string {
  return `https://www.threads.net/intent/post?text=${encodeURIComponent(`${text} ${url}`)}`;
}

function whatsappIntent(url: string, text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`;
}

/**
 * Every share target for a URL, in the order the brief lists them.
 *
 * `title` is the share copy, not the page title: a reader who shares this wants
 * to send the promise, and "Find cheaper car insurance | Playbook Hunt" is a
 * worse message than the sentence the page opened with.
 */
export function shareTargets(url: string, title: string): ShareTarget[] {
  return [
    { channel: "x", label: "X", href: xIntent(url, title), nativeOnly: false },
    // No web intent exists. See the note at the top of this file.
    { channel: "instagram", label: "Instagram", href: null, nativeOnly: true },
    { channel: "threads", label: "Threads", href: threadsIntent(url, title), nativeOnly: false },
    { channel: "facebook", label: "Facebook", href: facebookIntent(url), nativeOnly: false },
    { channel: "whatsapp", label: "WhatsApp", href: whatsappIntent(url, title), nativeOnly: false },
    { channel: "tiktok", label: "TikTok", href: null, nativeOnly: true },
    { channel: "copy", label: "Copy link", href: null, nativeOnly: false },
  ];
}

/**
 * Whether the browser can take this share natively.
 *
 * `navigator.share` is the gate, not the user agent: a desktop browser that has
 * it (Safari, mostly) should use it, and a phone browser that somehow does not
 * should fall back to copy. Feature-detecting the platform and then branching on
 * the screen size gets both of those wrong.
 */
export function canShareNatively(nav: { share?: unknown } | null | undefined): boolean {
  return typeof nav?.share === "function";
}