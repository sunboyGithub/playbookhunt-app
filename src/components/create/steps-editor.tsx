"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MAX_STEPS } from "@/lib/create/shape";

/**
 * The numbered steps a reader follows before the prompt does anything.
 *
 * ## Two rows on purpose
 *
 * `emptyDraft()` starts with two: one real sentence and one empty row. The empty
 * row is not a mistake — it is the invitation. A single empty row reads as "you
 * have not finished this field"; two rows, one of them filled in, read as "here is
 * what a step looks like, and here is where the next one goes". It is also why
 * `materializeSteps` restores the first step's default if the creator clears it:
 * the form would otherwise submit a playbook with no steps at all, silently.
 *
 * Removing is allowed down to one row rather than zero, because an empty array
 * renders as a section header with nothing under it, and the creator cannot tell
 * that from a rendering bug.
 */
export function StepsEditor({
  steps,
  onChange,
  error,
}: {
  steps: string[];
  onChange: (steps: string[]) => void;
  error?: string;
}) {
  const update = (index: number, value: string) => {
    onChange(steps.map((step, at) => (at === index ? value : step)));
  };

  return (
    <div className="space-y-3">
      {steps.map((step, index) => (
        <div key={`step-${index}`} className="flex items-start gap-3">
          <span aria-hidden className="mt-3 w-5 shrink-0 text-sm text-muted-foreground">
            {index + 1}.
          </span>
          <div className="flex-1 space-y-1.5">
            <label htmlFor={`create-step-${index}`} className="sr-only">
              Step {index + 1}
            </label>
            <Input
              id={`create-step-${index}`}
              value={step}
              onChange={(event) => update(index, event.target.value)}
              placeholder={index === 0 ? "Open your latest bill." : "Call and ask for the loyalty rate."}
              aria-invalid={(error !== undefined && index === 0) || undefined}
              className="h-11"
            />
          </div>
          {steps.length > 1 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onChange(steps.filter((_, at) => at !== index))}
              aria-label={`Remove step ${index + 1}`}
              className="mt-2 text-muted-foreground"
            >
              Remove
            </Button>
          ) : null}
        </div>
      ))}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Button
        type="button"
        variant="outline"
        onClick={() => onChange([...steps, ""])}
        disabled={steps.length >= MAX_STEPS}
      >
        Add a step
      </Button>
      {steps.length >= MAX_STEPS ? (
        <p className="text-sm text-muted-foreground">{MAX_STEPS} steps is the limit.</p>
      ) : null}
    </div>
  );
}