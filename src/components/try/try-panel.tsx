"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";

import { createFollowup } from "@/app/actions/create-followup";
import { logTryEvent } from "@/app/actions/log-try-event";
import { AgentPicker } from "@/components/try/agent-picker";
import { TryFieldInput } from "@/components/try/fields";
import { missingRequired, type TryField } from "@/lib/try/fields";
import { buildLaunch, canLaunch, formatPrompt } from "@/lib/agents/format";
import {
  dismissReminder as dismissReminderChoice,
  rememberAgent as rememberAgentChoice,
  useRememberedAgent,
  useReminderDismissed,
} from "@/lib/try/agent-memory";
import { renderTemplate } from "@/lib/try/template";
import type { Agent } from "@/server/queries/types";

/**
 * The try flow: pick an agent, fill in the details, take the prompt away.
 *
 * All of it runs in the browser. The reader's inputs never reach our server —
 * there is no action in this file that takes a field value, and the two that
 * exist take only ids, an agent slug and an action name. That is the privacy
 * requirement from AGENTS.md, and it holds because it is structural rather than
 * because each call site remembered to be careful.
 */

export type TryStep = { body: string };

export type TryPanelProps = {
  playbookId: string;
  playbookSlug: string;
  versionId: string | null;
  promise: string;
  inputs: TryField[];
  promptTemplate: string;
  steps: TryStep[];
  selectableAgents: Agent[];
  comingSoonAgents: Agent[];
  /** Null when the evidence threshold is not met, so nothing may be claimed. */
  recommendedEvidence: string | null;
  /** False signed out. Drives the reminder offer and the follow-up scheduling. */
  signedIn: boolean;
  /** Mirrors the consent banner on `/try`; suppressed in an embedded sheet. */
  showPrivacyNote?: boolean;
};

export function TryPanel({
  playbookId,
  playbookSlug,
  versionId,
  promise,
  inputs,
  promptTemplate,
  steps,
  selectableAgents,
  comingSoonAgents,
  recommendedEvidence,
  signedIn,
  showPrivacyNote = false,
}: TryPanelProps) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [showReminder, setShowReminder] = useState(false);
  const reminderDismissed = useReminderDismissed();

  // Refs rather than state for "have we already logged this". A ref is not part
  // of render, so writing it cannot re-render, and a `useEffect` guard that read
  // a boolean would fire twice under React's double-invoked effects in dev.
  const startedLogged = useRef(false);
  const tryEventId = useRef<string | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * The agent, derived rather than stored.
   *
   * The remembered choice wins only if it is *still selectable*. A remembered
   * slug for an agent that has since been disabled must not resurrect it — which
   * is AGENTS.md's "a display-name change alone must not enable it", arriving
   * from the other direction.
   */
  const remembered = useRememberedAgent();
  const agentSlug =
    remembered && selectableAgents.some((candidate) => candidate.slug === remembered)
      ? remembered
      : (selectableAgents[0]?.slug ?? "");

  const agent = selectableAgents.find((candidate) => candidate.slug === agentSlug) ?? null;

  const rendered = useMemo(
    () => renderTemplate(promptTemplate, inputs, values),
    [promptTemplate, inputs, values],
  );

  const prompt = useMemo(() => (agent ? formatPrompt(rendered.text, agent) : rendered.text), [
    rendered.text,
    agent,
  ]);

  const missing = useMemo(() => missingRequired(inputs, values), [inputs, values]);
  const launch = useMemo(() => (agent ? buildLaunch(agent, prompt) : null), [agent, prompt]);

  const chooseAgent = useCallback((slug: string) => {
    rememberAgentChoice(slug);
  }, []);

  const writeToClipboard = useCallback(async (text: string) => {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }

    // The fallback still exists because a clipboard API rejection in an insecure
    // context should not cost the reader their prompt.
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    document.body.removeChild(area);
  }, []);

  /**
   * Fire-and-forget side effects for an action.
   *
   * Logged before the work rather than after, so a failed insert cannot leave
   * the button looking un-pressed, and none of it is awaited — an analytics
   * failure must never delay or block a reader taking their prompt.
   */
  const record = useCallback(
    (action: "started" | "copied" | "opened") => {
      void (async () => {
        const { id } = await logTryEvent({
          playbookId,
          versionId,
          agentSlug,
          action,
        });

        if (id && !tryEventId.current) {
          tryEventId.current = id;
        }

        // Only a signed-in reader can be emailed, so only they get a follow-up.
        if (signedIn && action === "started" && id) {
          await createFollowup({ playbookId, tryEventId: id });
        }
      })();
    },
    [playbookId, versionId, agentSlug, signedIn],
  );

  // 'started' once per sheet open. Debounced by a ref rather than by state so
  // closing and reopening within one page view cannot double-count, and so a
  // re-render mid-open cannot log a second one. Effects run after hydration, so
  // `agentSlug` has already resolved to the remembered choice by here.
  useEffect(() => {
    if (!agent || startedLogged.current) {
      return;
    }

    startedLogged.current = true;
    record("started");
  }, [agent, record]);

  useEffect(() => {
    return () => {
      if (copyTimer.current) {
        clearTimeout(copyTimer.current);
      }
    };
  }, []);

  const onCopy = useCallback(async () => {
    setAttempted(true);

    await writeToClipboard(prompt);
    record("copied");

    setCopied(true);
    if (copyTimer.current) {
      clearTimeout(copyTimer.current);
    }
    copyTimer.current = setTimeout(() => setCopied(false), 3000);

    // The reminder offer appears only after a copy, and only once. Not before —
    // asking someone to sign in before they have got anything from the page is
    // the behaviour AGENTS.md rules out — and not again after they dismiss it.
    if (!signedIn && !reminderDismissed) {
      setShowReminder(true);
    }
  }, [prompt, record, signedIn, reminderDismissed, writeToClipboard]);

  const onOpen = useCallback(() => {
    if (!launch) {
      return;
    }

    record("opened");

    if (launch.mode === "prefill") {
      window.open(launch.url, "_blank", "noopener,noreferrer");
      return;
    }

    // No verified prefill scheme, so the prompt has to reach the reader by the
    // clipboard. The agent's home page opens regardless, so they land where they
    // were going to paste anyway.
    void (async () => {
      await writeToClipboard(prompt);
      if (launch.url) {
        window.open(launch.url, "_blank", "noopener,noreferrer");
      }
    })();
  }, [launch, prompt, record, writeToClipboard]);

  const dismissReminderCard = useCallback(() => {
    setShowReminder(false);
    dismissReminderChoice();
  }, []);

  const missingLabels = missing.map((key) => inputs.find((field) => field.key === key)?.label ?? key);

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="try-panel">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 pt-5 sm:px-6">
        {/* Step 1 */}
        <section aria-labelledby="try-step-agent">
          <h2 id="try-step-agent" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Step 1 · Pick your agent
          </h2>
          <div className="mt-3">
            <AgentPicker
              selectable={selectableAgents}
              comingSoon={comingSoonAgents}
              value={agentSlug}
              onChange={chooseAgent}
              recommendedEvidence={recommendedEvidence}
            />
          </div>
        </section>

        {/* Step 2 */}
        <section aria-labelledby="try-step-details" className="mt-8">
          <h2 id="try-step-details" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Step 2 · Your details
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{promise}</p>

          {inputs.length > 0 ? (
            <>
              <div className="mt-4 space-y-5">
                {inputs.map((field) => (
                  <TryFieldInput
                    key={field.id}
                    field={field}
                    value={values[field.key] ?? ""}
                    onChange={(next) => setValues((current) => ({ ...current, [field.key]: next }))}
                    invalid={attempted && missing.includes(field.key)}
                  />
                ))}
              </div>

              <p className="mt-5 rounded-lg bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
                Only {inputs.filter((field) => field.required).map((field) => field.label).join(" and ")}{" "}
                {inputs.filter((field) => field.required).length === 1 ? "is" : "are"} required · stays in
                your browser
              </p>
            </>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">
              This playbook needs no details from you — the prompt is ready as it is.
            </p>
          )}

          {showPrivacyNote ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Nothing you type here is sent to us. It is filled into the prompt on this page, in your
              browser.
            </p>
          ) : null}
        </section>

        {/* Step 3 */}
        <section aria-labelledby="try-step-prompt" className="mt-8">
          <h2 id="try-step-prompt" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Step 3 · Your prompt
          </h2>

          {attempted && missing.length > 0 ? (
            <p role="alert" className="mt-2 text-sm text-destructive" data-testid="try-missing-fields">
              Still needed: {missingLabels.join(", ")}. You can copy the prompt anyway — the missing
              parts are marked below.
            </p>
          ) : null}

          <pre
            data-testid="try-prompt"
            className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-border bg-muted/40 p-4 font-mono text-sm"
          >
            {prompt}
          </pre>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => void onCopy()}
              data-testid="try-copy"
              className="inline-flex h-12 flex-1 items-center justify-center rounded-full bg-brand px-6 text-base font-medium text-white transition-colors hover:bg-brand/90"
            >
              {copied ? "✓ Copied" : "Copy prompt"}
            </button>

            {agent && canLaunch(agent) ? (
              <button
                type="button"
                onClick={onOpen}
                data-testid="try-open"
                className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-muse px-6 text-base font-medium text-white transition-colors hover:bg-muse-dark"
              >
                <Image
                  src="/brand/muse-avatar.png"
                  alt=""
                  width={24}
                  height={24}
                  className="size-6 rounded-full object-cover ring-1 ring-[#0081FB]"
                />
                {launch?.mode === "prefill" ? `Open in ${agent.display_name}` : `Copy & open ${agent.display_name}`}
              </button>
            ) : null}
          </div>

          {/* The steps, as a plain list. No checkboxes: AGENTS.md rules out
              implying that progress has to be reported back, and a checkbox in a
              sheet that closes on navigation would be an input with nowhere to
              go. */}
          {steps.length > 0 ? (
            <div className="mt-8">
              <h3 className="text-sm font-semibold">Steps to use the playbook</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Use these instructions as you work through the playbook.
              </p>
              <ul data-testid="try-steps" className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
                {steps.map((step, index) => (
                  <li key={`${index}-${step.body.slice(0, 24)}`}>{step.body}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* The reminder offer. After a copy, signed out, once, dismissible, and
              never in the way of the copy itself. */}
          {showReminder ? (
            <div
              data-testid="try-reminder-card"
              className="mt-6 rounded-xl border border-muse-line bg-muse-soft p-4"
            >
              <p className="text-sm font-medium text-muse-dark">Save this prompt and get a reminder?</p>
              <p className="mt-1 text-sm text-muse-dark/80">
                We&apos;ll email you in a few days to ask whether it worked.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  href={`/login?next=/p/${playbookSlug}/try&reason=reminder`}
                  data-testid="try-reminder-signin"
                  className="inline-flex h-10 items-center rounded-full bg-muse px-5 text-sm font-medium text-white"
                >
                  Sign in
                </Link>
                <button
                  type="button"
                  onClick={dismissReminderCard}
                  data-testid="try-reminder-dismiss"
                  className="inline-flex h-10 items-center rounded-full border border-muse-line px-5 text-sm font-medium text-muse-dark"
                >
                  Not now
                </button>
              </div>
            </div>
          ) : null}

          <div className="mt-6 rounded-xl border border-border p-4">
            <p className="text-sm font-medium">Did it work? Come back and report your result</p>
            <Link
              href={`/p/${playbookSlug}/report`}
              data-testid="try-report-link"
              className="mt-3 inline-flex h-10 items-center rounded-full border border-border px-5 text-sm font-medium hover:bg-muted/40"
            >
              Report
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}