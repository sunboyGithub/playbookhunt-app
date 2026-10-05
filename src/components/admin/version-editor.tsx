"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { INPUT_TYPES } from "@/lib/admin/playbook-schema";
import { checkPromptReferences } from "@/lib/admin/prompt-refs";
import { createPlaybookVersion } from "@/server/admin/actions/playbooks";

/**
 * Writing a new version of a playbook's prompt, inputs and steps.
 *
 * Editing this creates a *new version*; it never overwrites the one that is
 * current. That is the whole reason this is a form and not an inline edit, and
 * it is not incidental — a report cites the version its reader was given, so a
 * prompt that changes underneath the numbers leaves the numbers unexplainable.
 *
 * ## Why the placeholder check runs while you type
 *
 * `{{customer_name}}` in the prompt with no input of that name is the most common
 * way a playbook breaks, and the reader finds it: they paste the braces into
 * their agent and get a prompt with a literal `{{customer_name}}` in it. The
 * check is the same one the server runs (`checkPromptReferences`, shared rather
 * than reimplemented) shown live, so the mistake is visible before it is saved
 * instead of after somebody's report explains it.
 *
 * ## Why an unused input is a warning and not an error
 *
 * Unused is harmless — an input can be asked for and then the prompt is mostly
 * instructions. An unknown placeholder is fatal, because the reader pastes
 * braces. One is a style problem and the other is a broken playbook, and they do
 * not deserve the same treatment.
 *
 * ## Why the changelog is a required field
 *
 * Two years from now the question "why did the success rate on this one move?" is
 * answered by the version history, and a history of versions that all say nothing
 * answers nothing. One line is the bar.
 */

type InputDraft = {
  key: string;
  label: string;
  type: (typeof INPUT_TYPES)[number];
  required: boolean;
  help: string;
  /** Comma-separated in the UI; an array of strings on the way to the action. */
  choices: string;
};

export type VersionDraft = {
  promptTemplate: string;
  changelog: string;
  inputs: InputDraft[];
  steps: string[];
};

const EMPTY_INPUT: InputDraft = {
  key: "",
  label: "",
  type: "text",
  required: false,
  help: "",
  choices: "",
};

const TYPE_LABEL: Record<(typeof INPUT_TYPES)[number], string> = {
  text: "One line of text",
  textarea: "A paragraph",
  select: "Pick from a list you write",
  number: "A number",
  money: "An amount",
  zip: "A postcode",
  provider_picker: "Pick from the providers we already know",
  date: "A date",
};

function choicesToArray(choices: string): string[] {
  return choices
    .split(",")
    .map((choice) => choice.trim())
    .filter((choice) => choice.length > 0);
}

export function VersionEditor({
  playbookId,
  draft,
  nextVersion,
}: {
  playbookId: string;
  draft: VersionDraft;
  nextVersion: number;
}) {
  const router = useRouter();
  const [state, setState] = useState(draft);
  const [pending, startTransition] = useTransition();

  const keys = useMemo(() => state.inputs.map((input) => input.key).filter(Boolean), [state.inputs]);
  const references = useMemo(
    () => checkPromptReferences(state.promptTemplate, keys),
    [state.promptTemplate, keys],
  );

  const requiredCount = state.inputs.filter((input) => input.required).length;

  const patchInput = (index: number, patch: Partial<InputDraft>) => {
    setState((current) => ({
      ...current,
      inputs: current.inputs.map((input, at) => (at === index ? { ...input, ...patch } : input)),
    }));
  };

  const moveInput = (index: number, delta: number) => {
    setState((current) => {
      const to = index + delta;
      if (to < 0 || to >= current.inputs.length) return current;
      const inputs = [...current.inputs];
      [inputs[index], inputs[to]] = [inputs[to], inputs[index]];
      return { ...current, inputs };
    });
  };

  const removeInput = (index: number) => {
    setState((current) => ({
      ...current,
      inputs: current.inputs.filter((_, at) => at !== index),
    }));
  };

  const moveStep = (index: number, delta: number) => {
    setState((current) => {
      const to = index + delta;
      if (to < 0 || to >= current.steps.length) return current;
      const steps = [...current.steps];
      [steps[index], steps[to]] = [steps[to], steps[index]];
      return { ...current, steps };
    });
  };

  const submit = () => {
    startTransition(async () => {
      const result = await createPlaybookVersion({
        playbookId,
        promptTemplate: state.promptTemplate,
        changelog: state.changelog,
        inputs: state.inputs
          // A row with no label is a row somebody clicked "add" and did not fill
          // in. Dropping it here means an abandoned draft does not have to be
          // deleted by hand before the version can be saved.
          .filter((input) => input.label.trim().length > 0)
          .map((input) => ({
            key: input.key.trim() || input.label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_"),
            label: input.label.trim(),
            type: input.type,
            required: input.required,
            help: input.help.trim() || null,
            options:
              input.type === "select" || input.type === "provider_picker"
                ? choicesToArray(input.choices)
                : null,
          })),
        steps: state.steps
          .filter((step) => step.trim().length > 0)
          .map((step) => ({ body: step.trim() })),
      });

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      for (const warning of result.warnings ?? []) {
        toast.warning(warning);
      }

      toast.success(`Version ${nextVersion} is live.`);
      router.refresh();
    });
  };

  return (
    <form
      className="space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div>
        <label htmlFor="version-prompt" className="text-sm font-medium">
          Prompt
        </label>
        <p className="text-xs text-muted-foreground">
          Put{" "}
          <code className="rounded bg-muted px-1">{"{{input_key}}"}</code> where the reader&rsquo;s
          own answer goes. It is filled in on their machine — nothing they type is sent to us.
        </p>
        <Textarea
          id="version-prompt"
          className="mt-1 min-h-64 font-mono text-sm"
          value={state.promptTemplate}
          maxLength={20_000}
          onChange={(event) => setState((current) => ({ ...current, promptTemplate: event.target.value }))}
          data-testid="version-prompt"
        />

        <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
          {references.unknown.length > 0 ? (
            <span className="rounded bg-tint-peach px-2 py-1 text-partly">
              The prompt uses {references.unknown.map((key) => `{{${key}}}`).join(", ")} — there is
              no input with that name.
            </span>
          ) : null}
          {references.unused.length > 0 ? (
            <span className="rounded bg-muted px-2 py-1 text-muted-foreground">
              Nothing in the prompt uses {references.unused.join(", ")}.
            </span>
          ) : null}
          {references.unknown.length === 0 && references.unused.length === 0 ? (
            <span className="rounded bg-tint-mint px-2 py-1 text-worked">
              Every placeholder has an input.
            </span>
          ) : null}
        </div>
      </div>

      <div>
        <div className="flex items-baseline justify-between">
          <h3 className="text-sm font-medium">Inputs</h3>
          <p className="text-xs text-muted-foreground">
            {requiredCount} required. At most two — a playbook that asks for five is a form, not a
            prompt.
          </p>
        </div>

        <ul className="mt-2 space-y-3" data-testid="version-inputs">
          {state.inputs.map((input, index) => (
            <li key={index} className="rounded-xl border border-border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="min-w-40 flex-1">
                  <label className="text-xs text-muted-foreground" htmlFor={`input-label-${index}`}>
                    Name the reader sees
                  </label>
                  <Input
                    id={`input-label-${index}`}
                    className="mt-0.5"
                    value={input.label}
                    maxLength={80}
                    placeholder="Your provider"
                    onChange={(event) => patchInput(index, { label: event.target.value })}
                  />
                </div>

                <div className="w-40">
                  <label className="text-xs text-muted-foreground" htmlFor={`input-key-${index}`}>
                    Key in the prompt
                  </label>
                  <Input
                    id={`input-key-${index}`}
                    className="mt-0.5 font-mono"
                    value={input.key}
                    maxLength={60}
                    placeholder="provider"
                    onChange={(event) =>
                      patchInput(index, {
                        key: event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"),
                      })
                    }
                  />
                </div>

                <div className="w-52">
                  <label className="text-xs text-muted-foreground" htmlFor={`input-type-${index}`}>
                    Kind
                  </label>
                  <select
                    id={`input-type-${index}`}
                    className="mt-0.5 w-full rounded-lg border border-border bg-card px-2 py-2 text-sm"
                    value={input.type}
                    onChange={(event) =>
                      patchInput(index, { type: event.target.value as InputDraft["type"] })
                    }
                  >
                    {INPUT_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {TYPE_LABEL[type]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={input.required}
                    onCheckedChange={(checked) => patchInput(index, { required: checked === true })}
                  />
                  Required
                </label>

                <div className="min-w-48 flex-1">
                  <Input
                    aria-label={`Help text for ${input.label || "this input"}`}
                    className="h-9"
                    value={input.help}
                    maxLength={200}
                    placeholder="One line of help, optional"
                    onChange={(event) => patchInput(index, { help: event.target.value })}
                  />
                </div>

                <div className="flex gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    type="button"
                    aria-label="Move up"
                    disabled={index === 0}
                    onClick={() => moveInput(index, -1)}
                  >
                    <ArrowUp className="size-4" aria-hidden />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    type="button"
                    aria-label="Move down"
                    disabled={index === state.inputs.length - 1}
                    onClick={() => moveInput(index, 1)}
                  >
                    <ArrowDown className="size-4" aria-hidden />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    type="button"
                    aria-label="Remove this input"
                    onClick={() => removeInput(index)}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                </div>
              </div>

              {input.type === "select" ? (
                <div className="mt-2">
                  <label className="text-xs text-muted-foreground" htmlFor={`input-choices-${index}`}>
                    Choices, separated by commas
                  </label>
                  <Input
                    id={`input-choices-${index}`}
                    className="mt-0.5"
                    value={input.choices}
                    placeholder="Comcast, Xfinity, Verizon"
                    onChange={(event) => patchInput(index, { choices: event.target.value })}
                  />
                </div>
              ) : null}
            </li>
          ))}
        </ul>

        <Button
          size="sm"
          variant="outline"
          type="button"
          className="mt-2"
          disabled={state.inputs.length >= 12}
          onClick={() => setState((current) => ({ ...current, inputs: [...current.inputs, { ...EMPTY_INPUT }] }))}
        >
          <Plus className="size-4" aria-hidden />
          Add an input
        </Button>
      </div>

      <div>
        <h3 className="text-sm font-medium">Steps</h3>
        <p className="text-xs text-muted-foreground">
          How to run it, in order. Shown under the prompt; the agent reads it, the reader does not
          have to follow it exactly.
        </p>

        <ol className="mt-2 space-y-2">
          {state.steps.map((step, index) => (
            <li key={index} className="flex gap-2">
              <span className="mt-2 w-5 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                {index + 1}.
              </span>
              <Textarea
                aria-label={`Step ${index + 1}`}
                className="min-h-16 flex-1"
                value={step}
                maxLength={500}
                onChange={(event) =>
                  setState((current) => ({
                    ...current,
                    steps: current.steps.map((body, at) => (at === index ? event.target.value : body)),
                  }))
                }
              />
              <div className="flex shrink-0 flex-col gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  type="button"
                  aria-label="Move up"
                  disabled={index === 0}
                  onClick={() => moveStep(index, -1)}
                >
                  <ArrowUp className="size-4" aria-hidden />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  type="button"
                  aria-label="Move down"
                  disabled={index === state.steps.length - 1}
                  onClick={() => moveStep(index, 1)}
                >
                  <ArrowDown className="size-4" aria-hidden />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  type="button"
                  aria-label="Remove this step"
                  onClick={() =>
                    setState((current) => ({
                      ...current,
                      steps: current.steps.filter((_, at) => at !== index),
                    }))
                  }
                >
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </div>
            </li>
          ))}
        </ol>

        <Button
          size="sm"
          variant="outline"
          type="button"
          className="mt-2"
          disabled={state.steps.length >= 10}
          onClick={() => setState((current) => ({ ...current, steps: [...current.steps, ""] }))}
        >
          <Plus className="size-4" aria-hidden />
          Add a step
        </Button>
      </div>

      <div>
        <label htmlFor="version-changelog" className="text-sm font-medium">
          What changed
        </label>
        <p className="text-xs text-muted-foreground">
          Required. This is the line somebody reads in a year trying to work out why the numbers
          moved.
        </p>
        <Input
          id="version-changelog"
          className="mt-1"
          value={state.changelog}
          maxLength={300}
          placeholder="Tightened step 2 and stopped asking for the account number."
          onChange={(event) => setState((current) => ({ ...current, changelog: event.target.value }))}
          data-testid="version-changelog"
        />
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending} data-testid="version-save">
          Publish version {nextVersion}
        </Button>
        <p className="text-xs text-muted-foreground">
          Version {nextVersion - 1} stays exactly as it is. Reports already filed against it keep
          pointing at it.
        </p>
      </div>
    </form>
  );
}