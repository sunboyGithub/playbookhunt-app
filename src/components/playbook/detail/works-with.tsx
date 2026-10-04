import { AgentMark } from "@/components/agents/agent-mark";
import { formatSuccessRateFrom } from "@/lib/stats/format";
import type { DetailStats } from "@/lib/stats/detail";
import type { Agent } from "@/server/queries/types";

/**
 * The sidebar's "Works with" block.
 *
 * One agent is highlighted; the coming-soon ones sit below as greyed chips. Two
 * rules from AGENTS.md are load-bearing here and both are easy to break by
 * being helpful:
 *
 * - **No "Coming soon" label.** The chips carry the agent's name and nothing
 *   else. A reader who sees "Coming soon" learns nothing they can act on and
 *   reads it as an apology; a greyed chip that cannot be pressed already says it.
 * - **Hidden agents are not here at all.** `listAgents` omits them, so a
 *   playbook authored against one resolves without it appearing anywhere. This
 *   component renders exactly what it is given and does not widen the list.
 *
 * The coming-soon chips are real `<button disabled>` rather than non-interactive
 * `<li>`s. A chip that looks like a control and is not one is worse than one
 * that says it cannot be used, and `disabled` is what gets announced.
 */
export function WorksWith({
  activeAgent,
  comingSoon,
  stats,
}: {
  activeAgent: Agent | null;
  comingSoon: Agent[];
  stats: DetailStats;
}) {
  const rate = formatSuccessRateFrom({
    report_count: stats.report_count,
    success_rate_raw: stats.success_rate_raw,
  });

  return (
    <section aria-labelledby="works-with-heading">
      <h2 id="works-with-heading" className="text-sm font-semibold">
        Works with
      </h2>

      <div className="mt-2 rounded-xl border border-muse-line bg-muse-soft p-3">
        <div className="flex items-center gap-2">
          <AgentMark slug={activeAgent?.slug ?? "muse"} className="size-6 text-muse" />
          <span className="font-medium text-muse">{activeAgent?.display_name ?? "Muse"}</span>
        </div>
        <p className="mt-1 text-sm text-muse-dark">
          Calls and chats for you
          {rate.kind === "rate" ? (
            <>
              {" · "}
              <span className="font-semibold tabular-nums">{rate.percent}% worked</span> (n)
            </>
          ) : (
            // Below the threshold there is no percentage to show, and no
            // substitute that would be honest either — so the sentence simply
            // ends. A placeholder here would be the one place on the page that
            // implies a rate nobody measured.
            " · no results yet"
          )}
        </p>
      </div>

      <ul className="mt-2 flex flex-wrap gap-2">
        {comingSoon.map((agent) => (
          <li key={agent.slug}>
            <button
              type="button"
              disabled
              data-testid={`agent-chip-${agent.slug}`}
              className="flex cursor-not-allowed items-center gap-1.5 rounded-full border border-border bg-muted px-3 py-1.5 text-sm text-muted-foreground opacity-60"
            >
              <AgentMark slug={agent.slug} className="size-4" />
              {agent.display_name}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}