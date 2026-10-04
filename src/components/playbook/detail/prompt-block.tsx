"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, Copy, ChevronDown } from "lucide-react";
import { toast } from "sonner";

import { logTryEvent } from "@/app/actions/log-try-event";
import { Button } from "@/components/ui/button";

/**
 * The prompt itself: collapsed to four lines, with a copy button.
 *
 * The copy button is the single most-used control on this page — it is the
 * moment a reader takes the thing away — so it does three things at once and
 * none of them is optional: writes to the clipboard, logs a `copied` try event
 * so the tried count means something, and says so for three seconds before
 * reverting to a label the reader can find again.
 *
 * On the clipboard: `navigator.clipboard.writeText` needs a secure context, and
 * on plain-http local development there isn't one. The `execCommand` path is the
 * fallback rather than an error message, because a copy button that works in
 * production and silently does nothing on a developer's own machine is a bug
 * that gets reported as "it doesn't work" and is impossible to reproduce.
 */
export function PromptBlock({
  prompt,
  playbookId,
  versionId,
  tryHref,
  stepCount,
}: {
  prompt: string;
  playbookId: string;
  versionId: string | null;
  /** Where the toast's secondary link goes. The try sheet in P7 replaces this. */
  tryHref: string;
  stepCount: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A copy confirmation that outlives its component would set state on an
  // unmounted component, and in React 19 that is a warning rather than a no-op.
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const copy = useCallback(async () => {
    // Logged before the clipboard write, not after: `writeText` rejects on a
    // denied permission, and a copy that visibly failed should not still count
    // as a try.
    void logTryEvent({ playbookId, versionId, action: "copied" });

    const ok = await writeToClipboard(prompt);
    if (!ok) {
      toast.error("Couldn't copy", {
        description: "Select the prompt and copy it manually.",
      });
      return;
    }

    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 3000);

    toast.success("Copied! Paste it into Muse.", {
      description: (
        <>
          Want it filled in with your details?{" "}
          <Link href={tryHref} className="font-medium underline underline-offset-2">
            Try this playbook →
          </Link>
        </>
      ),
    });
  }, [playbookId, prompt, tryHref, versionId]);

  const lineCount = prompt.split("\n").length;

  return (
    <section aria-labelledby="prompt-heading">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="prompt-heading" className="text-lg font-semibold">
          The playbook
        </h2>
        <Button
          variant="outline"
          size="sm"
          onClick={copy}
          className="ml-auto"
          data-testid="copy-prompt"
          // The label changes, so the accessible name changes with it. Both
          // states name the action rather than the state alone: "Copied" on its
          // own announces as a status, "Copy prompt" announces as a button.
          aria-label={copied ? "Copied to clipboard" : "Copy prompt"}
        >
          {copied ? <Check aria-hidden className="text-worked" /> : <Copy aria-hidden />}
          {copied ? "✓ Copied" : "Copy prompt"}
        </Button>
      </div>

      <p className="mt-1 text-sm text-muted-foreground">
        {stepCount} {stepCount === 1 ? "step" : "steps"} · copy the prompt, paste it into your agent,
        then follow the steps below.
      </p>

      <div className="relative mt-3">
        <pre
          data-testid="prompt-text"
          className={`overflow-x-auto rounded-xl border border-border bg-card p-4 font-mono text-sm leading-relaxed whitespace-pre-wrap ${
            expanded ? "" : "max-h-28 overflow-hidden"
          }`}
        >
          {prompt}
        </pre>

        {/* A fade rather than a hard clip, so the cut looks deliberate. */}
        {!expanded ? (
          <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-14 rounded-b-xl bg-gradient-to-t from-card to-transparent" />
        ) : null}
      </div>

      {lineCount > 4 ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setExpanded((value) => !value)}
          className="mt-1"
          aria-expanded={expanded}
          data-testid="toggle-prompt"
        >
          <ChevronDown
            aria-hidden
            className={`transition-transform ${expanded ? "rotate-180" : ""}`}
          />
          {expanded ? "Show less" : "Show full prompt"}
        </Button>
      ) : null}
    </section>
  );
}

/**
 * Clipboard write with a fallback.
 *
 * The fallback exists for `http://localhost` on browsers that withhold
 * `navigator.clipboard` outside a secure context, and for the case where the
 * permission is refused outright.
 */
async function writeToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through: a rejected promise is not the end of the attempt.
    }
  }

  try {
    const area = document.createElement("textarea");
    area.value = text;
    // Off-screen rather than `display: none`, which would make the selection
    // empty and the copy a silent no-op.
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}