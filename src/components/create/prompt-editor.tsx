"use client";

import { useRef } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { checkPromptReferences, describeMissingReferences } from "@/lib/admin/prompt-refs";
import { type DraftInput } from "@/lib/create/shape";

/**
 * The prompt, with the inputs one click away.
 *
 * ## Why there are Insert buttons at all
 *
 * The prompt is the one field where a typo is invisible. `{{input_1_provider}}`
 * typed by hand and `{{input_1_placeholder}}` — one character different — both
 * *look* right on screen, and the difference only appears to a reader, as a
 * literal `{{input_1_provider}}` pasted into an agent. Nobody catches that by
 * re-reading, which is why the button exists: the key is copied from the input
 * that owns it rather than retyped.
 *
 * The cursor position is the other half. Inserting at the end of a paragraph the
 * creator has already written is not what they meant, so the button inserts where
 * the caret is, replacing any selection.
 *
 * ## The reference check is the same one the importer runs
 *
 * `checkPromptReferences` is imported from the admin module rather than
 * reimplemented. A preview that agreed with the page and the importer disagreed
 * with it would be the worst of the three, because it would be confident. The
 * check runs on every keystroke here, before anything is submitted, so the error
 * appears next to the field that caused it rather than as a rejection at the end.
 */
export function PromptEditor({
  value,
  onChange,
  inputs,
  error,
}: {
  value: string;
  onChange: (value: string) => void;
  inputs: DraftInput[];
  error?: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const insert = (token: string) => {
    const textarea = textareaRef.current;

    if (!textarea) {
      // Should not happen — the ref is on the element being rendered — but the
      // fallback appends rather than dropping the token on the floor, which is
      // what a `return` here would do.
      onChange(`${value}${value.endsWith(" ") || value === "" ? "" : " "}${token}`);
      return;
    }

    const start = textarea.selectionStart ?? value.length;
    const end = textarea.selectionEnd ?? value.length;

    const next = `${value.slice(0, start)}${token}${value.slice(end)}`;

    onChange(next);

    // Put the caret after what was inserted, in the DOM as well as in the value.
    // Without the second half the next keystroke lands in the wrong place, and
    // the caret jump is the kind of thing that makes an editor feel broken.
    const caret = start + token.length;
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(caret, caret);
    });
  };

  const declared = inputs.map((input) => input.key);
  const report = checkPromptReferences(value, declared);

  const labels = new Map(inputs.map((input) => [input.key, input.name.trim() || input.key]));

  // `unused` is deliberately not shown as an error. The check's own doc says why:
  // an optional input is often explained by an instruction rather than by the
  // prompt, and refusing that produces worse prose than leaving it alone. The
  // buttons below mention the gap without blocking the submit.
  const unknownSentence =
    report.unknown.length > 0 ? describeMissingReferences(report, labels) : "";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {inputs.map((input) => (
          <Button
            key={input.key}
            type="button"
            variant="outline"
            size="sm"
            onClick={() => insert(`{{${input.key}}}`)}
            disabled={input.name.trim() === ""}
            title={
              input.name.trim() === ""
                ? "Name this input first, so the button can say what it inserts."
                : undefined
            }
          >
            Insert {input.name.trim() === "" ? `input ${input.key}` : input.name.trim()}
          </Button>
        ))}
      </div>

      <div className="space-y-1.5">
        <label htmlFor="create-prompt" className="text-sm font-medium">
          The prompt
        </label>
        <Textarea
          id="create-prompt"
          data-testid="create-prompt"
          ref={textareaRef}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          rows={12}
          aria-invalid={error !== undefined || report.unknown.length > 0 || undefined}
          aria-describedby={error || report.unknown.length > 0 ? "create-prompt-error" : undefined}
          className="font-mono text-sm"
          placeholder="I want to lower my internet bill. My provider is {{input_1_placeholder}}."
        />
      </div>

      {error ? (
        <p id="create-prompt-error" className="text-sm text-destructive">
          {error}
        </p>
      ) : unknownSentence !== "" ? (
        <p id="create-prompt-error" className="text-sm text-destructive">
          {unknownSentence}
        </p>
      ) : null}

      {value.trim() !== "" && report.unused.length > 0 ? (
        // A warning, not an error. The brief says to "encourage" referring to
        // every input, so a field a reader fills in that changes nothing is worth
        // saying out loud — but it is not the schema's business to refuse.
        <p className="text-sm text-muted-foreground">
          {report.unused.length === 1 ? "One input is" : `${report.unused.length} inputs are`} not
          referenced in the prompt, so {report.unused.length === 1 ? "it" : "they"} will not change
          what the agent does.{" "}
          {report.unused.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => insert(`{{${key}}}`)}
              className="underline underline-offset-2"
            >
              Add {"{{" + key + "}}"}
            </button>
          ))}
        </p>
      ) : null}
    </div>
  );
}