"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TryFieldInput } from "@/components/try/fields";
import { renderTemplate } from "@/lib/try/template";
import { formatOption, type DraftInput } from "@/lib/create/shape";

/**
 * See the playbook as a reader will, with the creator's own sample answers.
 *
 * ## Why this exists at all
 *
 * The creator has written a prompt with `{{input_1_placeholder}}` in it. Nothing
 * on the form tells them what that will *look* like once it is filled in — and the
 * failure it catches is the common one: a prompt that reads fine as a template and
 * produces a wall of broken grammar once "Comcast" is dropped into the middle of a
 * sentence. Seeing it rendered, once, before submitting, is the cheapest possible
 * version of that lesson.
 *
 * ## The answers stay here
 *
 * These answers are invented from the input's own name, they are held in this
 * component's state, and they are never sent anywhere — the template is rendered
 * by `renderTemplate` in this browser tab. That is the same rule the try panel
 * follows and for the same reason: AGENTS.md says never send input values to our
 * server or analytics, and here there is not even a server action to send them to.
 * The preview is a local rendering, not a trial run of the real thing.
 *
 * `renderTemplate` is the *same* function the reader's try panel uses, not a
 * lookalike. A preview that rendered differently from the real page would be
 * worse than no preview, because it would be reassuring.
 */

/** A plausible answer for a field, built from its label. */
function sampleAnswer(input: DraftInput): string {
  const name = input.name.trim();

  if (name === "") {
    return "";
  }

  switch (formatOption(input.format).dbType) {
    case "money":
    case "number":
      return "40";
    case "zip":
      return "94107";
    case "date":
      return "2026-01-15";
    default:
      return name;
  }
}

/** The draft input, in the shape `TryFieldInput` already knows how to render. */
function toTryField(input: DraftInput) {
  return {
    id: `preview-${input.key}`,
    key: input.key,
    label: input.name.trim() === "" ? "Your input" : input.name.trim(),
    type: formatOption(input.format).dbType,
    required: input.required,
    options: input.choices.length > 0 ? input.choices : null,
    placeholder: null,
    why_it_helps: null,
  } satisfies Parameters<typeof TryFieldInput>[0]["field"] & { id: string };
}

export function PreviewDialog({
  open,
  onOpenChange,
  prompt,
  inputs,
  steps,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prompt: string;
  inputs: DraftInput[];
  steps: string[];
}) {
  // Seeded once from the inputs on mount. `useState` with a function argument
  // would re-seed on every render; an explicit reset button is clearer than the
  // effect that would otherwise be needed to notice a changed input list.
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const named = inputs.filter((input) => input.name.trim() !== "");

  const answerFor = (input: DraftInput) => answers[input.key] ?? sampleAnswer(input);

  const { text: rendered, unfilled } = renderTemplate(
    prompt,
    // Labels, not just keys: an unfilled placeholder renders as `[Internet
    // provider]`, so a creator who left one blank sees which field it was rather
    // than a bare pair of braces.
    named.map((input) => ({ key: input.key, label: input.name.trim() })),
    Object.fromEntries(named.map((input) => [input.key, answerFor(input)])),
  );

  const liveSteps = steps.filter((step) => step.trim() !== "");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Preview</DialogTitle>
          <DialogDescription>
            What a reader sees. The answers below are examples — change them to check a case you
            care about.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {named.length > 0 ? (
            <section className="space-y-3">
              <h3 className="text-sm font-medium">Example answers</h3>
              {named.map((input) => (
                <TryFieldInput
                  key={input.key}
                  field={toTryField(input)}
                  value={answerFor(input)}
                  onChange={(value) => setAnswers((current) => ({ ...current, [input.key]: value }))}
                />
              ))}
            </section>
          ) : (
            <p className="text-sm text-muted-foreground">
              No inputs yet, so there is nothing to fill in. The prompt below is what a reader gets.
            </p>
          )}

          <section className="space-y-2">
            <h3 className="text-sm font-medium">The prompt</h3>
            <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-muted/50 p-4 text-sm">
              {rendered.trim() === "" ? "Your prompt will appear here." : rendered}
            </pre>
            {unfilled.length > 0 ? (
              <p className="text-sm text-muted-foreground">
                {unfilled.length === 1 ? "One input is" : `${unfilled.length} inputs are`} still
                blank, so {unfilled.length === 1 ? "it appears" : "they appear"} as{" "}
                <code className="rounded bg-muted px-1">{"{{…}}"}</code> — exactly as a reader would
                see {unfilled.length === 1 ? "it" : "them"} if {unfilled.length === 1 ? "they" : "it"}{" "}
                skip {unfilled.length === 1 ? "that field" : "those fields"}.
              </p>
            ) : null}
          </section>

          {liveSteps.length > 0 ? (
            <section className="space-y-2">
              <h3 className="text-sm font-medium">Steps</h3>
              <ol className="list-decimal space-y-1 pl-5 text-sm">
                {liveSteps.map((step, index) => (
                  <li key={`${index}-${step.slice(0, 12)}`}>{step.trim()}</li>
                ))}
              </ol>
            </section>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}