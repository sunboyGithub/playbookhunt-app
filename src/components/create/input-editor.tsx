"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useId } from "react";
import {
  INPUT_FORMATS,
  MAX_INPUTS,
  MAX_REQUIRED_INPUTS,
  addInput,
  formatOption,
  parseChoices,
  removeInput,
  type DraftInput,
} from "@/lib/create/shape";

/**
 * The list of things a reader will be asked for.
 *
 * ## The labels say "User input 3", and that is not the same as the key
 *
 * The number in the label is a *position* and the number in `{{input_3_x}}` is an
 * *identity*. They are kept apart deliberately: a creator who deletes the first
 * input sees the second become "User input 1", and its `{{input_2_...}}` in the
 * prompt must keep working. Renumbering the labels is friendly; renumbering the
 * keys would silently break every reference to them, which is why the labels are
 * positional and the keys are not.
 *
 * ## Choices only appear for the formats that have them
 *
 * A "short text" input with a choices box would store options nothing reads. The
 * brief's cap is two *required* inputs and eight in total, so the editor refuses
 * the ninth rather than letting the schema reject it at submit — an error about a
 * limit is better given before the creator has typed the ninth one.
 */
export function InputEditor({
  inputs,
  onChange,
  errors,
  invalidKeys,
}: {
  inputs: DraftInput[];
  onChange: (inputs: DraftInput[]) => void;
  errors: Record<string, string>;
  /** Keys that hold required-input problems, so each row can mark itself. */
  invalidKeys: readonly string[];
}) {
  const uid = useId();
  const requiredCount = inputs.filter((input) => input.required).length;

  const update = (index: number, patch: Partial<DraftInput>) => {
    onChange(inputs.map((input, at) => (at === index ? { ...input, ...patch } : input)));
  };

  return (
    <div className="space-y-4">
      {inputs.map((input, index) => {
        const format = formatOption(input.format);
        const nameError = errors[`inputs.${index}.name`];
        const choicesError = errors[`inputs.${index}.choices`];
        const controlId = `${uid}-${input.key}`;

        return (
          <div
            key={input.key}
            className="space-y-3 rounded-lg border border-border p-4"
            data-testid={`create-input-${input.key}`}
          >
            <div className="flex items-start gap-3">
              <div className="flex-1 space-y-1.5">
                <label htmlFor={`${controlId}-name`} className="text-sm font-medium">
                  User input {index + 1}
                  <span aria-hidden className="text-muse">
                    {" "}
                    *
                  </span>
                </label>
                <Input
                  id={`${controlId}-name`}
                  value={input.name}
                  onChange={(event) => update(index, { name: event.target.value })}
                  placeholder="Internet provider"
                  aria-invalid={nameError !== undefined || undefined}
                  aria-describedby={nameError ? `${controlId}-name-error` : undefined}
                  className="h-11"
                />
                {nameError ? (
                  <p id={`${controlId}-name-error`} className="text-sm text-destructive">
                    {nameError}
                  </p>
                ) : null}
              </div>

              {inputs.length > 1 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onChange(removeInput(inputs, index))}
                  aria-label={`Remove user input ${index + 1}`}
                  className="mt-7 text-muted-foreground"
                >
                  Remove
                </Button>
              ) : null}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor={`${controlId}-format`} className="text-sm font-medium">
                  What kind of answer
                </label>
                <Select
                  value={input.format}
                  onValueChange={(value) =>
                    update(index, {
                      format: value as DraftInput["format"],
                      // Choices are dropped when switching to a format that has
                      // none. Keeping them would store options nothing renders,
                      // and the creator cannot see why they were kept.
                      choices: formatOption(value as DraftInput["format"]).hasChoices
                        ? input.choices
                        : [],
                    })
                  }
                >
                  <SelectTrigger id={`${controlId}-format`} className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INPUT_FORMATS.map((option) => (
                      <SelectItem key={option.format} value={option.format}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-end">
                <label className="flex min-h-11 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={input.required}
                    disabled={!input.required && requiredCount >= MAX_REQUIRED_INPUTS}
                    onChange={(event) => update(index, { required: event.target.checked })}
                    className="size-4 rounded border-border"
                  />
                  Required
                </label>
              </div>
            </div>

            {!input.required && requiredCount >= MAX_REQUIRED_INPUTS ? (
              // Disabled controls that do not say why are the most common dead end
              // in a form; this is the sentence that makes the cap a decision
              // rather than a bug.
              <p className="text-sm text-muted-foreground">
                {MAX_REQUIRED_INPUTS} required inputs is the cap — beyond that the page asks its
                reader too much before it has shown them anything.
              </p>
            ) : null}

            {format.hasChoices ? (
              <div className="space-y-1.5">
                <label htmlFor={`${controlId}-choices`} className="text-sm font-medium">
                  Choices, one per line
                </label>
                <Textarea
                  id={`${controlId}-choices`}
                  value={input.choices.join("\n")}
                  onChange={(event) => update(index, { choices: parseChoices(event.target.value) })}
                  placeholder={"Comcast\nXfinity\nVerizon"}
                  rows={3}
                  aria-invalid={choicesError !== undefined || undefined}
                />
                {choicesError ? <p className="text-sm text-destructive">{choicesError}</p> : null}
              </div>
            ) : null}

            <p className="text-xs text-muted-foreground">
              <code className="rounded bg-muted px-1">{`{{${input.key}}}`}</code> in your prompt fills
              this in.
              {invalidKeys.includes(input.key) ? " This input is not referenced in your prompt yet." : null}
            </p>
          </div>
        );
      })}

      <Button
        type="button"
        variant="outline"
        onClick={() => onChange(addInput(inputs))}
        disabled={inputs.length >= MAX_INPUTS}
      >
        Add another input
      </Button>
      {inputs.length >= MAX_INPUTS ? (
        <p className="text-sm text-muted-foreground">{MAX_INPUTS} inputs is the limit.</p>
      ) : null}
    </div>
  );
}