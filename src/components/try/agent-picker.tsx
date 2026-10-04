"use client";

import Image from "next/image";

import { AgentMark } from "@/components/agents/agent-mark";
import type { Agent } from "@/server/queries/types";

/**
 * The agent step: one large card per agent you can actually use, and a row of
 * greyed chips for the ones you cannot.
 *
 * Which agents fall in which group is decided by `listAgents()`, which filters on
 * `status` — never on the display name. That is deliberate and load-bearing:
 * AGENTS.md requires that activating an agent be verified across creation, Try
 * and Report together, so a vendor whose name changes, or whose integration is
 * half-built, must not become selectable by renaming itself. Only the shared
 * query can hold that line, which is why this component takes two lists rather
 * than the whole table and deciding for itself.
 *
 * Muse renders in Muse blue with the official avatar inside a Meta-blue ring, per
 * AGENTS.md. Coming-soon agents are real disabled `<button>`s rather than
 * `aria-disabled` list items, so they are genuinely unfocusable and unfakeable.
 */

type Props = {
  selectable: Agent[];
  comingSoon: Agent[];
  /** Slug of the current choice. Must be one of `selectable`. */
  value: string;
  onChange: (slug: string) => void;
  /** Evidence line for the recommended agent, or null when it may not be shown. */
  recommendedEvidence?: string | null;
};

const CAPABILITY_LABELS: Record<string, string> = {
  info: "Info",
  web_actions: "Web actions",
  phone_calls: "Phone calls",
};

function capabilityLine(agent: Agent): string {
  const labels = agent.capabilities
    .map((capability) => CAPABILITY_LABELS[capability] ?? capability)
    .filter(Boolean);

  return labels.join(" · ");
}

export function AgentPicker({
  selectable,
  comingSoon,
  value,
  onChange,
  recommendedEvidence,
}: Props) {
  return (
    <div>
      <ol className="space-y-3">
        {selectable.map((agent, index) => {
          const selected = agent.slug === value;

          return (
            <li key={agent.id}>
              <button
                type="button"
                onClick={() => onChange(agent.slug)}
                aria-pressed={selected}
                data-testid={`agent-option-${agent.slug}`}
                className={[
                  "flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition-colors",
                  selected
                    ? "border-muse bg-muse-soft ring-1 ring-muse"
                    : "border-border bg-card hover:bg-muted/40",
                ].join(" ")}
              >
                {/* The official avatar in a Meta-blue ring, at roughly 14% of the
                    radius, for every place Muse appears as an agent. */}
                <span className="relative shrink-0">
                  <Image
                    src="/brand/muse-avatar.png"
                    alt=""
                    width={56}
                    height={56}
                    className="size-14 rounded-full object-cover ring-2 ring-[#0081FB]"
                  />
                </span>

                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-base font-semibold text-muse-dark">
                      {agent.display_name}
                    </span>
                    {/* Only the first selectable agent is recommended. With one
                        agent live today that is always Muse; the rule is stated
                        this way rather than "whichever is Muse" so a second agent
                        does not arrive already carrying the badge. */}
                    {index === 0 ? (
                      <span className="rounded-full bg-muse px-2 py-0.5 text-xs font-medium text-white">
                        Recommended
                      </span>
                    ) : null}
                  </span>

                  <span className="mt-0.5 block text-sm text-muted-foreground">
                    {capabilityLine(agent)}
                  </span>

                  {index === 0 && recommendedEvidence ? (
                    <span className="mt-0.5 block text-sm text-muted-foreground">
                      {recommendedEvidence}
                    </span>
                  ) : null}
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      {/* No labels, no "Coming soon" text, no explanation. AGENTS.md is explicit
          that these render as greyed disabled chips and nothing more; a reader who
          is told an agent is nearly here has been told something we cannot yet
          promise is true. */}
      {comingSoon.length > 0 ? (
        <ul className="mt-4 flex flex-wrap items-center gap-2">
          {comingSoon.map((agent) => (
            <li key={agent.id}>
              <button
                type="button"
                disabled
                data-testid={`try-agent-chip-${agent.slug}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-3 py-1.5 text-sm text-muted-foreground opacity-60"
              >
                <AgentMark slug={agent.slug} className="size-4" />
                {agent.display_name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}