/**
 * Per-agent prompt formatting and launch URLs.
 *
 * Both live here rather than in a component because both are decisions about
 * data — what an agent's prompt looks like, and where its "open" button points —
 * and neither is a rendering concern. No provider URL appears anywhere in this
 * file or in any component: they come from the `agents` table and stay there.
 */

import type { Agent } from "@/server/queries/types";

/**
 * The longest launch URL we will hand to a browser.
 *
 * A URL over roughly this length starts failing in the places people actually
 * open one — chat clients and mail clients truncate, mobile browsers drop them,
 * and Windows' own limit is 2083 characters. A prompt that long is better copied
 * than half-transmitted, so past the limit the flow copies first and opens the
 * agent's home page, which is the same fallback AGENTS.md mandates for an
 * unverified prefill scheme.
 */
export const SAFE_URL_LENGTH = 1800;

/** How a filled prompt should be handed to an agent. */
export type LaunchPlan =
  /** Open the agent with the prompt already in it. No copy needed. */
  | { mode: "prefill"; url: string }
  /**
   * Copy first, then open the agent's home page. The prompt is on the clipboard
   * for the reader to paste. Used whenever prefill is unverified or the URL
   * would be too long.
   */
  | { mode: "home"; url: string | null; needsCopyFirst: true };

/**
 * Format a prompt for an agent.
 *
 * Every agent currently uses the text as authored, so this returns it unchanged.
 * The hook exists because per-agent formatting is a real requirement — some
 * agents want a preamble, some want a fenced block — and adding it later should
 * be a change to this switch rather than to the try flow.
 *
 * Unknown agents fall through to the plain text rather than throwing: a prompt
 * that renders is worth more than a prompt that is formatted correctly for an
 * agent this build has never heard of.
 */
export function formatPrompt(prompt: string, agent: Pick<Agent, "slug" | "prompt_format">): string {
  switch (agent.slug) {
    case "muse":
      // Muse takes the prompt as authored. `prompt_format` is recorded as
      // "markdown" in the agents table but the templates are plain prose with
      // numbered steps, which needs no transformation.
      return prompt;
    default:
      return prompt;
  }
}

/**
 * Where the "Open in <agent>" button should point, and whether the prompt has to
 * be copied first.
 *
 * Prefill requires `launch_url_template` to be non-null. AGENTS.md is explicit
 * that this column "is left null until each vendor's prefill support is
 * verified", and no component may invent a URL scheme for a vendor whose real one
 * is unknown. So with Muse's template still null, the honest answer is the home
 * page plus a copy — which is what this returns today.
 *
 * Returns `null` only when the agent has neither a template nor a home URL, which
 * is a data problem rather than a state this flow should invent its way out of.
 */
export function buildLaunch(
  agent: Pick<Agent, "launch_url_template" | "home_url">,
  prompt: string,
): LaunchPlan | null {
  const template = agent.launch_url_template?.trim();
  const home = agent.home_url?.trim() || null;

  // No destination at all. Null rather than a home plan with a null URL, so the
  // caller can tell "this agent cannot be opened" from "this agent needs a copy
  // first" — the first disables the button, the second does not.
  if (!template && !home) {
    return null;
  }

  if (template) {
    // Substituted once, and URL-encoded as a whole: a prompt containing `&`,
    // `#`, `?` or a space would otherwise terminate the query string early and
    // silently truncate what the agent receives.
    const url = template.replace(/\{\{\s*prompt\s*\}\}/g, encodeURIComponent(prompt));

    // A template with no placeholder would silently drop the prompt entirely.
    if (url.includes(encodeURIComponent(prompt)) && url.length <= SAFE_URL_LENGTH) {
      return { mode: "prefill", url };
    }
  }

  return { mode: "home", url: home, needsCopyFirst: true };
}

/** Whether the agent can be offered as a destination at all. */
export function canLaunch(agent: Pick<Agent, "launch_url_template" | "home_url">): boolean {
  return Boolean(agent.launch_url_template?.trim() || agent.home_url);
}