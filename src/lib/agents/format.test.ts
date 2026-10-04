import { describe, expect, it } from "vitest";

import { buildLaunch, canLaunch, formatPrompt, SAFE_URL_LENGTH } from "./format";

const PROMPT = "You are helping me lower my home internet bill.\n1. Find offers.";

describe("formatPrompt", () => {
  it("returns the prompt unchanged for Muse", () => {
    expect(formatPrompt(PROMPT, { slug: "muse", prompt_format: "markdown" })).toBe(PROMPT);
  });

  it("returns the prompt unchanged for an agent it has no rule for", () => {
    // A new agent should not break the try flow, and should not silently lose
    // the prompt either.
    expect(formatPrompt(PROMPT, { slug: "brand-new-agent", prompt_format: "markdown" })).toBe(
      PROMPT,
    );
  });

  it("does not mutate or strip the prompt's own newlines", () => {
    expect(formatPrompt(PROMPT, { slug: "muse", prompt_format: "markdown" })).toContain("\n1.");
  });
});

describe("buildLaunch", () => {
  it("uses the home page and a copy when no prefill template is verified", () => {
    // This is Muse's real state today: launch_url_template is null because
    // prefill support has not been verified.
    const plan = buildLaunch({ launch_url_template: null, home_url: "https://muse.ai" }, PROMPT);

    expect(plan).toEqual({ mode: "home", url: "https://muse.ai", needsCopyFirst: true });
  });

  it("prefills when a template exists and the URL is short enough", () => {
    const plan = buildLaunch(
      { launch_url_template: "https://muse.ai/new?prompt={{prompt}}", home_url: "https://muse.ai" },
      PROMPT,
    );

    expect(plan?.mode).toBe("prefill");
    expect(plan?.mode === "prefill" && plan.url).toBe(
      `https://muse.ai/new?prompt=${encodeURIComponent(PROMPT)}`,
    );
  });

  it("URL-encodes the whole prompt so query characters cannot truncate it", () => {
    const nasty = 'Find offers & compare #1 for $99? a=b';

    const plan = buildLaunch(
      { launch_url_template: "https://example.com/?p={{prompt}}", home_url: null },
      nasty,
    );

    expect(plan?.mode === "prefill" && plan.url).toBe(
      `https://example.com/?p=${encodeURIComponent(nasty)}`,
    );

    // The property that matters: nothing from the prompt escaped into the query
    // structure. Every `&`, `#` and `?` inside it is percent-encoded, so the URL
    // still has exactly one parameter and the agent receives the whole prompt.
    const query = plan?.mode === "prefill" ? plan.url.slice(plan.url.indexOf("?") + 1) : "";
    expect(query.split("&")).toHaveLength(1);
    expect(query).not.toContain("#");
  });

  it("falls back to copy-and-home when the encoded URL is too long", () => {
    const long = "x".repeat(SAFE_URL_LENGTH + 100);

    const plan = buildLaunch(
      { launch_url_template: "https://example.com/?p={{prompt}}", home_url: "https://example.com" },
      long,
    );

    expect(plan).toEqual({ mode: "home", url: "https://example.com", needsCopyFirst: true });
  });

  it("still prefills when the URL sits just inside the limit", () => {
    const prefix = "https://example.com/?p=";
    const prompt = "x".repeat(SAFE_URL_LENGTH - prefix.length);

    const plan = buildLaunch({ launch_url_template: prefix + "{{prompt}}", home_url: null }, prompt);

    expect(plan?.mode).toBe("prefill");
  });

  it("does not prefill through a template with no placeholder", () => {
    // Prefilling here would drop the prompt silently and open a blank composer.
    const plan = buildLaunch(
      { launch_url_template: "https://example.com/new", home_url: "https://example.com" },
      PROMPT,
    );

    expect(plan).toEqual({ mode: "home", url: "https://example.com", needsCopyFirst: true });
  });

  it("treats a whitespace-only template as absent", () => {
    const plan = buildLaunch({ launch_url_template: "   ", home_url: "https://example.com" }, PROMPT);

    expect(plan?.mode).toBe("home");
  });

  it("returns null when the agent has neither a template nor a home URL", () => {
    // A data problem. Null says "this agent cannot be a destination", which is
    // different from "this agent needs a copy first".
    expect(buildLaunch({ launch_url_template: null, home_url: null }, PROMPT)).toBeNull();
  });
});

describe("canLaunch", () => {
  it("is true with a home URL alone", () => {
    expect(canLaunch({ launch_url_template: null, home_url: "https://muse.ai" })).toBe(true);
  });

  it("is true with a prefill template alone", () => {
    expect(canLaunch({ launch_url_template: "https://x/?p={{prompt}}", home_url: null })).toBe(true);
  });

  it("is false with neither", () => {
    expect(canLaunch({ launch_url_template: null, home_url: null })).toBe(false);
  });
});