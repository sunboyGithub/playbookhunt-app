import { describe, expect, it } from "vitest";

import { canShareNatively, shareTargets } from "@/lib/share";

// Not named `URL`: that would shadow the global this file constructs to
// parse the very URLs it is asserting on.
const PAGE_URL = "https://playbookhunt.test/p/cheaper-car-insurance";
const TITLE = "Compare like-for-like car insurance options before deciding whether to switch.";

function target(channel: string) {
  const found = shareTargets(PAGE_URL, TITLE).find((item) => item.channel === channel);
  if (!found) throw new Error(`no share target for ${channel}`);
  return found;
}

describe("shareTargets", () => {
  it("offers every channel the brief lists, in order", () => {
    expect(shareTargets(PAGE_URL, TITLE).map((item) => item.channel)).toEqual([
      "x",
      "instagram",
      "threads",
      "facebook",
      "whatsapp",
      "tiktok",
      "copy",
    ]);
  });

  it("builds an X intent carrying both the text and the url", () => {
    const href = target("x").href!;
    // twitter.com, not x.com: x.com/intent/tweet does not resolve, and the
    // failure mode is a share box with no text in it.
    expect(href.startsWith("https://twitter.com/intent/tweet?")).toBe(true);
    expect(new URL(href).searchParams.get("url")).toBe(PAGE_URL);
    expect(new URL(href).searchParams.get("text")).toBe(TITLE);
  });

  it("builds a Facebook sharer carrying the url", () => {
    expect(new URL(target("facebook").href!).searchParams.get("u")).toBe(PAGE_URL);
  });

  it("puts the text and url in the Threads text parameter", () => {
    // Threads' intent takes `text`, not `url`. Encoding the title into a `url`
    // parameter it does not support produces a post that silently drops it.
    const href = target("threads").href!;
    const text = new URL(href).searchParams.get("text")!;
    expect(text).toContain(TITLE);
    expect(text).toContain(PAGE_URL);
    expect(new URL(href).searchParams.has("url")).toBe(false);
  });

  it("puts the text and url in the WhatsApp text parameter", () => {
    const text = new URL(target("whatsapp").href!).searchParams.get("text")!;
    expect(text).toContain(TITLE);
    expect(text).toContain(PAGE_URL);
  });

  it("has no href for Instagram and TikTok", () => {
    // Neither platform publishes a share URL. Rendering a link anyway produces a
    // broken composer rather than an obvious failure, which is worse.
    expect(target("instagram").href).toBeNull();
    expect(target("tiktok").href).toBeNull();
    expect(target("instagram").nativeOnly).toBe(true);
    expect(target("tiktok").nativeOnly).toBe(true);
  });

  it("does not force the four real intents through the native sheet", () => {
    for (const channel of ["x", "threads", "facebook", "whatsapp"]) {
      expect(target(channel).nativeOnly).toBe(false);
    }
  });

  it("encodes characters that would break a query string", () => {
    const href = target("x").href!;
    // A bare `&` in the promise would otherwise end the `text` parameter early
    // and truncate the message at the ampersand.
    const awkward = shareTargets(PAGE_URL, "Save money & time — fast").find(
      (t) => t.channel === "x",
    )!;
    expect(new URL(awkward.href!).searchParams.get("text")).toBe("Save money & time — fast");
    expect(href).not.toBe("");
  });
});

describe("canShareNatively", () => {
  it("is true only when share is callable", () => {
    expect(canShareNatively({ share: () => {} })).toBe(true);
    // A `share` property that exists but is not a function — which is what a
    // serialised or partial navigator looks like — must not pass.
    expect(canShareNatively({ share: "yes" })).toBe(false);
    expect(canShareNatively({})).toBe(false);
    expect(canShareNatively(null)).toBe(false);
  });
});