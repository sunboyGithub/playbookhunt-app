import type { DraftInput } from "@/lib/create/shape";

/**
 * The prompt the creator starts from.
 *
 * ## Why this is generated text and not an HTML placeholder
 *
 * The brief is unusually firm about this, and the reason survives contact with
 * the code: a `<textarea placeholder>` is grey text that evaporates the moment
 * anyone types, and it is *never submitted*. A creator who reads the example,
 * believes it, and hits "Submit for review" would send whatever was really in
 * the box — which is nothing. Worse, the prompt would then be genuinely empty and
 * the failure would surface in the admin queue rather than in the form.
 *
 * So the example is a real value in the state. It submits, it saves, it reloads,
 * and a playbook can be published on the strength of having done nothing to it.
 * The grey styling is applied to a value, not to a placeholder, which is why it
 * is a class on the textarea's text colour rather than `placeholder=`.
 *
 * ## Why it is regenerated at all
 *
 * An empty box in front of an ordinary person is a request to guess. A filled one
 * that already names the title and lists the inputs gives them something to react
 * to, which is the difference between a template and a form. It stays in step with
 * the title and the inputs — a renamed input appears in it — and stops the moment
 * the creator edits it, because at that point it is their wording and ours is
 * presumptuous. See `promptTouched`.
 */

/** Fallback when the title is still blank, so the example is never a stub. */
const UNNAMED_TASK = "get this done";

/**
 * One bullet per named input.
 *
 * Inputs with no name are skipped rather than rendered as `- : {{key}}`, because
 * a bullet with a blank label is worse than no bullet: the creator cannot see
 * which hole belongs to what, and the reference the example exists to teach is
 * the one it would be hiding.
 *
 * Skipping is safe. An unnamed input is also one the submit validator refuses, so
 * a submission built from this text never ships with a dangling reference.
 */
function inputLines(inputs: readonly DraftInput[]): string {
  const lines = inputs
    .filter((input) => input.name.trim().length > 0)
    .map((input) => `- ${input.name.trim()}: {{${input.key}}}`);

  return lines.join("\n");
}

/**
 * Build the example prompt from the current title and inputs.
 *
 * Uses every named input's `{{key}}`, so the two directions of
 * `checkPromptReferences` both come out clean on an untouched example: no unknown
 * holes, and no input left unused.
 */
export function generateExample(title: string, inputs: readonly DraftInput[]): string {
  const task = title.trim() || UNNAMED_TASK;
  const details = inputLines(inputs);

  return [
    `I want to ${task}.`,
    "",
    "Here's what I know so far:",
    "",
    details || "- (no details yet)",
    "",
    "Please help me with this:",
    "",
    "1. Ask me for anything you're still missing before you begin.",
    "2. Work through it one step at a time, and tell me why at each step.",
    "3. Show me anything that could save me money or time.",
    "",
    "When you're done, give me a short summary and the three most useful next steps.",
  ].join("\n");
}

/**
 * The prompt a draft should currently show.
 *
 * The one place the "until the creator edits it" rule lives. Callers pass the
 * current `prompt` and `promptTouched` and get back what to render and store, so
 * no call site has to remember the condition — which is the only way this stays
 * true through a reload, an autosave, and a rename arriving in either order.
 *
 * Once touched, the creator's text is returned untouched, including when it is
 * empty: a prompt somebody deliberately cleared is a prompt somebody is about to
 * retype, and filling it back in for them would be the overwrite this flag exists
 * to prevent.
 */
export function syncPrompt(
  title: string,
  inputs: readonly DraftInput[],
  current: string,
  touched: boolean,
): { prompt: string; touched: boolean } {
  if (touched) {
    return { prompt: current, touched: true };
  }

  return { prompt: generateExample(title, inputs), touched: false };
}

/**
 * True while the textarea is still showing text nobody wrote.
 *
 * Only used to style the text grey, and it is deliberately *not* used to decide
 * whether to regenerate — {@link syncPrompt} owns that, and it owns it from the
 * stored flag. Deriving it from the text would resurrect the bug this file exists
 * to describe: a creator who edits their example, changes nothing else, and
 * reloads would find it silently replaced.
 */
export function isGeneratedPrompt(draft: {
  prompt: string;
  promptTouched: boolean;
  title: string;
  inputs: readonly DraftInput[];
}): boolean {
  return !draft.promptTouched && draft.prompt === generateExample(draft.title, draft.inputs);
}