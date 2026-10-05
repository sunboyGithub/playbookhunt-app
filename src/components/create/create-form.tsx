"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { InputEditor } from "@/components/create/input-editor";
import { PreviewDialog } from "@/components/create/preview-dialog";
import { PromptEditor } from "@/components/create/prompt-editor";
import { StepsEditor } from "@/components/create/steps-editor";
import { saveDraft, submitPlaybook } from "@/app/actions/create-playbook";
import { isGeneratedPrompt, syncPrompt } from "@/lib/create/example";
import { OUTCOME_OPTIONS, emptyDraft, type DraftContent } from "@/lib/create/shape";
import { firstError, type DraftErrors } from "@/lib/create/schema";
import { checkPromptReferences } from "@/lib/admin/prompt-refs";
import type { OutcomeType } from "@/lib/report/shape";

/**
 * The submission form.
 *
 * ## One piece of state, six sections
 *
 * `draft` holds everything and nothing else does. The temptation with a form this
 * size is a `useState` per field, and the reason not to is the prompt: it is
 * regenerated from the title and the inputs on every change, so "did the creator
 * edit it" has to be answerable at the moment of the edit rather than afterwards.
 * `syncPrompt` owns that rule and reads one flag; a form that tracked it in three
 * places would eventually disagree with itself.
 *
 * ## Autosave is a safety net, not a feature
 *
 * The draft is saved on a timer because a creator who loses twenty minutes of
 * typing to a closed tab is not coming back. It is deliberately *not* loud about
 * it: no "saving…" spinner over the form, no modal, no interruption. The status
 * is one line that changes when something happened, because the alternative — a
 * form that rearranges itself while somebody is typing in it — costs more than the
 * data it protects.
 *
 * The debounce is what stops a save per keystroke, and `revision` is what stops
 * two saves racing: `saveDraft` refuses a save whose revision has moved, and says
 * so rather than overwriting. See that action for why that is not bookkeeping.
 *
 * ## Nothing here sends an input value anywhere
 *
 * The form holds input *names*, not input *values* — those are the reader's, in
 * the preview dialog's local state. The one network call is `saveDraft`, which
 * sends the creator's own draft to their own row. That is AGENTS.md's rule, and it
 * is satisfied by there being no code path here that could transmit a reader's
 * answers.
 */

type SaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; at: number }
  | { kind: "error"; message: string }
  | { kind: "conflict"; message: string }
  | { kind: "signed-out" };

type CategoryOption = { id: string; name: string; emoji: string | null };

/** The draft as the server last saw it, which is not always the current state. */
type SavedIdentity = { draftId: string; revision: number } | null;

const AUTOSAVE_MS = 1200;

const SECTIONS = [
  { id: "outcome", label: "The outcome" },
  { id: "who", label: "Who it is for" },
  { id: "inputs", label: "What you need" },
  { id: "prompt", label: "The prompt" },
  { id: "steps", label: "Steps" },
  { id: "testing", label: "Testing" },
] as const;

export function CreateForm({
  categories,
  signedIn,
  initialDraft,
  initialDraftId,
  initialRevision,
  resumeStatus,
  resumeNote,
  locked,
}: {
  categories: CategoryOption[];
  signedIn: boolean;
  /** A restored draft, when the creator came back to one. */
  initialDraft?: DraftContent;
  initialDraftId?: string;
  initialRevision?: number;
  /** `changes_requested` or `rejected`, so the reviewer note can be shown. */
  resumeStatus?: string | null;
  resumeNote?: string | null;
  /** True when the draft's submission is in review or already approved. */
  locked?: boolean;
}) {
  // Not a redirect: the creator needs to see that it worked and what happens
  // next. A navigation to a list page would leave them wondering whether the
  // button had done anything at all.
  const [submitted, setSubmitted] = useState<{ slug: string } | null>(null);

  const [draft, setDraft] = useState<DraftContent>(() => initialDraft ?? emptyDraft());
  const [errors, setErrors] = useState<DraftErrors>({});
  const [save, setSave] = useState<SaveState>({ kind: "idle" });
  const [draftId, setDraftId] = useState<string | null>(initialDraftId ?? null);
  const [revision, setRevision] = useState<number>(initialRevision ?? 0);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  // The debounce timer, held in a ref so a re-render does not reset it — a state
  // variable would restart the countdown on every keystroke and the save would
  // never fire.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The promise for the save that is currently running, rather than a boolean.
  // A boolean could only answer "is one running"; submitting needs to *wait* for
  // it, and that wait is what stops a second draft row from appearing.
  const saveInFlight = useRef<Promise<void> | null>(null);

  /**
   * The identity of the draft as the server last saw it.
   *
   * React state cannot answer this from inside an async callback: `setDraftId`
   * has not taken effect by the time the code right after `await` reads it, so a
   * submit that flushed its own save would still submit the *previous* id — or
   * none. A ref is the only thing that is current immediately.
   */
  const savedRef = useRef<SavedIdentity>(null);

  // `persist` is kept in a ref for the same reason, and it is not a
  // style choice. `persist` closes over `draftId` and `revision`, both of which
  // a successful save updates — so listing it as an effect dependency makes every
  // save re-arm the timer that produces the next save, and the form saves in a
  // loop for as long as it is open. The timer reads the latest `persist` through
  // this ref instead, and the effect below depends only on the content, which is
  // what "there is something new to save" actually means.
  const persistRef = useRef<(content: DraftContent) => Promise<SavedIdentity>>(
    async () => null,
  );

  // `update` is the single way state changes, because the prompt has to be
  // re-derived from the title and the inputs on every one of them. Callers that
  // set the draft directly would silently skip that.
  const update = useCallback((patch: Partial<DraftContent>) => {
    setDraft((current) => {
      const next = { ...current, ...patch };

      if (patch.title !== undefined || patch.inputs !== undefined) {
        // Destributed rather than spread. `syncPrompt` returns its own field name
        // — `touched`, because that is the flag in `example.ts` — and spreading it
        // into the draft added a `touched` key instead of setting `promptTouched`.
        // `.strict()` on the payload then rejected every save, and the field name
        // leaked into the creator's error message as "touched".
        const synced = syncPrompt(next.title, next.inputs, next.prompt, next.promptTouched);

        return { ...next, prompt: synced.prompt, promptTouched: synced.touched };
      }

      return next;
    });

    // A field the creator is editing is no longer showing an old error, and
    // leaving it there is how a form ends up shouting at somebody who fixed it.
    setErrors((current) => {
      const keys = Object.keys(patch);
      if (keys.length === 0) return current;
      const next = { ...current };
      let changed = false;
      for (const key of keys) {
        if (next[key] !== undefined) {
          delete next[key];
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, []);

  const persist = useCallback(
    async (content: DraftContent) => {
      if (!signedIn) {
        setSave({ kind: "signed-out" });
        return null;
      }

      // A save already in flight is *joined*, not run again: the second would
      // carry the same `revision` as the first and be refused as a conflict with
      // itself, which the form would then have to explain to the creator.
      if (saveInFlight.current !== null) {
        await saveInFlight.current;
        return savedRef.current;
      }

      const run = (async () => {
        setSave({ kind: "saving" });

        const result = await saveDraft({ draftId, revision, content });

        if (result.ok) {
          savedRef.current = { draftId: result.draftId, revision: result.revision };
          setDraftId(result.draftId);
          setRevision(result.revision);
          setSave({ kind: "saved", at: Date.now() });
          return;
        }

        if (result.conflict) {
          setSave({ kind: "conflict", message: result.error });
          return;
        }

        if (result.signInRequired) {
          setSave({ kind: "signed-out" });
          return;
        }

        setSave({ kind: "error", message: result.error });
      })();

      saveInFlight.current = run;

      try {
        await run;
      } finally {
        saveInFlight.current = null;
      }

      return savedRef.current;
    },
    [draftId, revision, signedIn],
  );

  // Keeping the ref current is an effect, not a render-time assignment, because
  // writing a ref during render is a side effect and React Compiler says so.
  // Declared above the autosave effect on purpose: effects run in the order they
  // are declared, so the timer is always handed the current `persist`.
  useEffect(() => {
    persistRef.current = persist;
  }, [persist]);

  // Autosave. Every field, one timer, and the timer is cleared on unmount so a
  // save never fires against a component that has gone.
  useEffect(() => {
    if (!signedIn) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);

    saveTimer.current = setTimeout(() => {
      void persistRef.current(draft);
    }, AUTOSAVE_MS);

    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [draft, signedIn]);

  const focusField = useCallback((field: string | null) => {
    if (!field) return;

    const element = document.querySelector<HTMLElement>(`[data-testid="create-field-${field}"]`);

    if (!element) return;

    element.scrollIntoView({ block: "center", behavior: "smooth" });
    element.focus({ preventScroll: true });
  }, []);

  const submit = useCallback(async () => {
    setSubmitError(null);
    setSubmitting(true);

    let result: Awaited<ReturnType<typeof submitPlaybook>>;

    try {
      // Flush the pending autosave first, and cancel the timer that would have
      // fired it. This is not tidiness: the debounce is 1200ms, and a creator who
      // reads the form and presses submit inside that window has no draft id yet
      // — so the submission creates draft B while the timer goes on to create
      // draft A. The creator then sees two rows for one playbook on `/me`, one
      // "With a reviewer" and one "Draft, not submitted", and there is nothing
      // they can do about the second.
      if (saveTimer.current !== null) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }

      const flushed = await persistRef.current(draft);

      result = await submitPlaybook({
        draftId: flushed?.draftId ?? draftId,
        content: draft,
      });
    } finally {
      // A thrown action is still an ended submission. Leaving the button on
      // "Submitting…" would need a reload to clear, and a creator who presses it
      // again on a still-disabled button learns nothing.
      setSubmitting(false);
    }

    if (result.ok) {
      setSubmitted({ slug: result.slug });
      return;
    }

    if (result.signInRequired) {
      setSubmitError("Sign in to submit your playbook.");
      return;
    }

    setErrors(result.errors ?? {});
    setSubmitError(result.error);
    focusField(result.field ?? firstError(result.errors ?? {}));
  }, [draft, draftId, focusField]);

  const generated = isGeneratedPrompt(draft);

  // The same check the prompt editor runs, computed once here so the input rows
  // can mark the ones nobody references. Two components reading one function
  // beats each of them re-deriving "which keys are unused".
  const unusedKeys = checkPromptReferences(
    draft.prompt,
    draft.inputs.map((input) => input.key),
  ).unused;

  if (submitted) {
    return (
      <div
        className="mx-auto w-full max-w-2xl space-y-4 px-4 py-16 text-center sm:px-6"
        data-testid="create-submitted"
      >
        <h1 className="text-3xl font-semibold tracking-tight">Submitted</h1>
        <p className="text-muted-foreground">
          A reviewer will read it and come back to you. You can see the current status, and any note
          they leave, under My submissions.
        </p>
        <p className="text-sm text-muted-foreground">
          It will be published at{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">/p/{submitted.slug}</code> once it is
          approved — not before.
        </p>
        <div className="flex flex-wrap justify-center gap-3 pt-2">
          <Button asChild variant="outline">
            <Link href="/me">My submissions</Link>
          </Button>
          <Button asChild>
            <Link href="/create">Write another</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-10 px-4 py-10 sm:px-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Create a playbook</h1>
        <p className="text-muted-foreground">
          Write it as you would explain it to a friend. A reviewer reads it before anybody else
          does.
        </p>
      </header>

      {locked ? (
        <div
          role="status"
          className="rounded-lg border border-border bg-muted/40 p-4 text-sm"
          data-testid="create-locked"
        >
          <p className="font-medium">This one is with a reviewer.</p>
          <p className="mt-1 text-muted-foreground">
            Editing is switched off while that is true, so a change cannot arrive halfway through
            somebody reading it.{" "}
            <Link href="/me" className="underline underline-offset-2">
              See its status
            </Link>
            .
          </p>
        </div>
      ) : null}

      {resumeStatus === "changes_requested" ? (
        <div
          role="status"
          className="rounded-lg border border-muse/40 bg-muse/5 p-4 text-sm"
          data-testid="create-resume-note"
        >
          <p className="font-medium">A reviewer asked for changes.</p>
          {resumeNote ? <p className="mt-1 text-muted-foreground">{resumeNote}</p> : null}
        </div>
      ) : null}

      {resumeStatus === "rejected" ? (
        <div
          role="status"
          className="rounded-lg border border-border bg-muted/40 p-4 text-sm"
          data-testid="create-resume-note"
        >
          <p className="font-medium">This submission was not accepted.</p>
          {resumeNote ? <p className="mt-1 text-muted-foreground">{resumeNote}</p> : null}
        </div>
      ) : null}

      {/* Jump links. Six sections on one page is a long scroll on a phone, and a
          creator who cannot see that testing notes exist will not fill them in. */}
      <nav aria-label="Sections" className="flex flex-wrap gap-2 text-sm">
        {SECTIONS.map((section) => (
          <a
            key={section.id}
            href={`#${section.id}`}
            className="rounded-full border border-border px-3 py-1.5 text-muted-foreground transition-colors hover:bg-muted/50"
          >
            {section.label}
          </a>
        ))}
      </nav>

      {/* ---------------------------------------------------------------- 1 */}
      <section id="outcome" className="scroll-mt-24 space-y-5">
        <SectionHeading
          number={1}
          title="The outcome"
          blurb="What does somebody get, and what does it have in common with the playbooks already here?"
        />

        <Field label="Title" htmlFor="create-title" error={errors.title} required>
          <Input
            id="create-title"
            data-testid="create-field-title"
            value={draft.title}
            onChange={(event) => update({ title: event.target.value })}
            placeholder="Lower your internet bill"
            aria-invalid={errors.title !== undefined || undefined}
            className="h-11"
          />
        </Field>
        <p className="-mt-2 text-sm text-muted-foreground">
          Lead with the result, not the method. &ldquo;Lower your internet bill&rdquo; tells somebody
          whether this is for them; &ldquo;call your provider script&rdquo; does not.
        </p>

        <Field label="One-sentence promise" htmlFor="create-promise" error={errors.promise} required>
          <Textarea
            id="create-promise"
            data-testid="create-field-promise"
            value={draft.promise}
            onChange={(event) => update({ promise: event.target.value })}
            rows={2}
            placeholder="Cut the monthly cost without changing your plan."
            aria-invalid={errors.promise !== undefined || undefined}
          />
        </Field>

        <Field label="Category" htmlFor="create-category" error={errors.categoryId} required>
          <Select
            value={draft.categoryId}
            onValueChange={(value) => update({ categoryId: value })}
          >
            <SelectTrigger
              id="create-category"
              data-testid="create-field-categoryId"
              className="h-11"
              aria-invalid={errors.categoryId !== undefined || undefined}
            >
              <SelectValue placeholder="Pick the closest one" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.emoji ? `${category.emoji} ` : ""}
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="What kind of result is it?" error={errors.outcomeType} required>
          <Select
            value={draft.outcomeType ?? ""}
            onValueChange={(value) => update({ outcomeType: value as OutcomeType })}
          >
            <SelectTrigger
              data-testid="create-field-outcomeType"
              className="h-11"
              aria-invalid={errors.outcomeType !== undefined || undefined}
            >
              <SelectValue placeholder="Pick one" />
            </SelectTrigger>
            <SelectContent>
              {OUTCOME_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="mt-1.5 text-sm text-muted-foreground">
            This decides how results are reported back. If you picked a money type, readers will be
            asked what they saved — leave it off if you would rather they just say whether it worked.
          </p>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Minimum time, in minutes" htmlFor="create-time-min" error={errors.timeMin}>
            <Input
              id="create-time-min"
              data-testid="create-field-timeMin"
              type="number"
              inputMode="numeric"
              min={0}
              value={draft.timeMin ?? ""}
              onChange={(event) =>
                update({ timeMin: event.target.value === "" ? null : Number(event.target.value) })
              }
              className="h-11"
            />
          </Field>
          <Field label="Maximum time, in minutes" htmlFor="create-time-max" error={errors.timeMax}>
            <Input
              id="create-time-max"
              data-testid="create-field-timeMax"
              type="number"
              inputMode="numeric"
              min={0}
              value={draft.timeMax ?? ""}
              onChange={(event) =>
                update({ timeMax: event.target.value === "" ? null : Number(event.target.value) })
              }
              className="h-11"
            />
          </Field>
        </div>
      </section>

      {/* ---------------------------------------------------------------- 2 */}
      <section id="who" className="scroll-mt-24 space-y-5">
        <SectionHeading
          number={2}
          title="Who it is for"
          blurb="Both fields are optional and both earn their place: the second is the one that saves somebody from the wrong playbook."
        />

        <Field label="Who it is for" htmlFor="create-who-for" error={errors.whoFor}>
          <Textarea
            id="create-who-for"
            data-testid="create-field-whoFor"
            value={draft.whoFor}
            onChange={(event) => update({ whoFor: event.target.value })}
            rows={2}
            placeholder="People paying $70 or more a month who have been on the same plan for a year."
          />
        </Field>

        <Field label="Who it is not for" htmlFor="create-who-not-for" error={errors.whoNotFor}>
          <Textarea
            id="create-who-not-for"
            data-testid="create-field-whoNotFor"
            value={draft.whoNotFor}
            onChange={(event) => update({ whoNotFor: event.target.value })}
            rows={2}
            placeholder="People on a contract they cannot leave before the term ends."
          />
        </Field>
      </section>

      {/* ---------------------------------------------------------------- 3 */}
      <section id="inputs" className="scroll-mt-24 space-y-5">
        <SectionHeading
          number={3}
          title="What you need from the reader"
          blurb="At most two required. Everything past that is something a reader gives up on."
        />
        <InputEditor
          inputs={draft.inputs}
          onChange={(inputs) => update({ inputs })}
          errors={errors}
          invalidKeys={unusedKeys}
        />
      </section>

      {/* ---------------------------------------------------------------- 4 */}
      <section id="prompt" className="scroll-mt-24 space-y-5">
        <SectionHeading
          number={4}
          title="The prompt"
          blurb="What somebody pastes into the agent. Use the buttons rather than typing the braces."
        />
        <PromptEditor
          value={draft.prompt}
          onChange={(value) => update({ prompt: value, promptTouched: true })}
          inputs={draft.inputs}
          error={errors.prompt}
        />
        {generated ? (
          <p className="text-sm text-muted-foreground">
            This is an example we wrote from your title and inputs. Edit it as much as you like —
            once you do, we will stop rewriting it.
          </p>
        ) : null}
      </section>

      {/* ---------------------------------------------------------------- 5 */}
      <section id="steps" className="scroll-mt-24 space-y-5">
        <SectionHeading
          number={5}
          title="Steps"
          blurb="What to do first. Most playbooks need one or two."
        />
        <StepsEditor
          steps={draft.steps}
          onChange={(steps) => update({ steps })}
          error={errors.steps}
        />
      </section>

      {/* ---------------------------------------------------------------- 6 */}
      <section id="testing" className="scroll-mt-24 space-y-5">
        <SectionHeading
          number={6}
          title="Testing"
          blurb="Only the reviewer sees this."
        />

        <Field label="What result did you get?" htmlFor="create-notes" error={errors.testingNotes}>
          <Textarea
            id="create-notes"
            data-testid="create-field-testingNotes"
            value={draft.testingNotes}
            onChange={(event) => update({ testingNotes: event.target.value })}
            rows={3}
            placeholder="Saved $40 a month. Took two calls and one transfer."
          />
          <p className="mt-1.5 text-sm text-muted-foreground">
            This is a note to the reviewer. It is never shown on the page and never counted as a
            report — only readers&rsquo; own results count, and those arrive separately.
          </p>
        </Field>

        <Field label="Inspired by a post (optional)" htmlFor="create-source" error={errors.sourceUrl}>
          <Input
            id="create-source"
            data-testid="create-field-sourceUrl"
            value={draft.sourceUrl}
            onChange={(event) => update({ sourceUrl: event.target.value })}
            placeholder="https://"
            inputMode="url"
            aria-invalid={errors.sourceUrl !== undefined || undefined}
            className="h-11"
          />
          <p className="mt-1.5 text-sm text-muted-foreground">
            Any link, from anywhere. We do not check that it is ours.
          </p>
        </Field>
      </section>

      {/* ------------------------------------------------------------ footer */}
      <footer className="space-y-4 border-t border-border pt-6">
        {submitError ? (
          <p role="alert" className="text-sm text-destructive" data-testid="create-submit-error">
            {submitError}
          </p>
        ) : null}

        {!signedIn ? (
          <p className="text-sm text-muted-foreground">
            <Link href="/login?next=/create" className="underline underline-offset-2">
              Sign in
            </Link>{" "}
            to save your work as you go. You can read the whole form without an account.
          </p>
        ) : save.kind === "conflict" ? (
          <p role="status" className="text-sm text-muted-foreground" data-testid="create-save-state">
            {save.message}
          </p>
        ) : save.kind === "error" ? (
          <p role="status" className="text-sm text-destructive" data-testid="create-save-state">
            {save.message}
          </p>
        ) : save.kind === "saving" ? (
          <p className="text-sm text-muted-foreground" data-testid="create-save-state">
            Saving&hellip;
          </p>
        ) : save.kind === "saved" ? (
          <p className="text-sm text-muted-foreground" data-testid="create-save-state">
            Draft saved.
          </p>
        ) : null}

        <div className="flex flex-wrap gap-3">
          <Button type="button" variant="outline" onClick={() => setPreviewOpen(true)}>
            Preview
          </Button>
          <Button type="button" onClick={() => void submit()} disabled={submitting || locked === true}>
            {submitting ? "Submitting…" : locked === true ? "With a reviewer" : "Submit for review"}
          </Button>
        </div>
      </footer>

      <PreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        prompt={draft.prompt}
        inputs={draft.inputs}
        steps={draft.steps}
      />
    </div>
  );
}

function SectionHeading({
  number,
  title,
  blurb,
}: {
  number: number;
  title: string;
  blurb: string;
}) {
  return (
    <div className="space-y-1">
      <h2 className="text-xl font-semibold tracking-tight">
        <span aria-hidden className="mr-2 text-muted-foreground">
          {number}.
        </span>
        {title}
      </h2>
      <p className="text-sm text-muted-foreground">{blurb}</p>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  error,
  required,
  children,
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
        {required ? (
          <span aria-hidden className="text-muse">
            {" "}
            *
          </span>
        ) : null}
      </label>
      {children}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
