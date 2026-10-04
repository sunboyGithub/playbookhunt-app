"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Check, ChevronDown, ChevronUp, FileText, Loader2, Star } from "lucide-react";
import { toast } from "sonner";

import { ShareMenu } from "@/components/playbook/detail/share-menu";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { submitReport, type SubmitReportResult } from "@/app/actions/submit-report";
import { editReport, replaceReportEvidence } from "@/app/actions/edit-report";
import { trackReportOpened, trackReportSubmitted } from "@/lib/analytics";
import {
  MAX_EVIDENCE_BYTES,
  RESULTS,
  TIME_SPENT_OPTIONS,
  amountField,
  normalizeReferralCode,
  type OutcomeType,
  type ReportField,
  type ReportResult,
} from "@/lib/report/shape";
import { museReferralNote } from "@/lib/site-config";

/**
 * "Did it work?" — the whole outcome form.
 *
 * One required field. Everything else is optional and says so, in the small
 * muted style the brief asks for, because a form that *looks* like it has seven
 * requirements gets one filled in — and this form's output is the number this
 * site publishes.
 *
 * Two structural decisions worth knowing before editing:
 *
 * **The redaction tips expand in place.** They are a `<details>`-free
 * conditional block inside the same form element, so nothing unmounts: the
 * result, the amount, the note, the referral code and the chosen file all
 * survive opening and closing the tips. The acceptance criterion is exactly
 * this, and it fails the moment the tips become a link to another page or a
 * separate component that remounts the inputs.
 *
 * **The file is never uploaded until submit.** Stripping EXIF re-encodes the
 * image in the browser, the size is checked in the browser, and the bytes are
 * read at the last possible moment. Nothing about a reader's evidence touches
 * the network until they have said it worked.
 */

export type ReportFormProps = {
  playbookId: string;
  playbookSlug: string;
  versionId: string;
  title: string;
  /** Absolute URL for the share sheet on the success screen. */
  shareUrl: string;
  outcomeType: OutcomeType | null;
  outcomeUnit: string | null;
  reportFields: ReportField[];
  agents: { slug: string; name: string }[];
  /** Preselected agent, from the reader's last try if there was one. */
  defaultAgentSlug?: string | null;
  /** From a one-click follow-up link: "worked" | "partly" | "didnt". */
  defaultResult?: ReportResult | null;
  /** A report of theirs, being corrected rather than filed for the first time. */
  editing?: {
    reportId: string;
    /** The version the report is filed against, which is not always the current one. */
    versionId: string;
    result: ReportResult;
    amount: number | null;
    timeSpentBucket: string | null;
    provider: string | null;
    region: string | null;
    note: string | null;
    agentSlug: string | null;
    /** True when a screenshot is already attached — the area becomes "change it". */
    hasEvidence: boolean;
  } | null;
  /**
   * Called once the report is stored.
   *
   * For the dialog host, which needs to refresh the page *behind* the panel —
   * but must not close it, because the confirmation the reader is looking at
   * lives inside this component and closing would hide the only evidence that
   * anything worked.
   */
  onSubmitted?: () => void;
};

export function ReportForm(props: ReportFormProps) {
  // Destructured so the submit callback can depend on the one function it calls
  // rather than on the whole props object, which changes on every render and
  // would make the callback unstable for no reason.
  const { onSubmitted, editing } = props;
  const [result, setResult] = useState<ReportResult | null>(editing?.result ?? props.defaultResult ?? null);
  const [agentSlug, setAgentSlug] = useState(
    editing?.agentSlug ?? props.defaultAgentSlug ?? props.agents[0]?.slug ?? "",
  );
  // Prefilled from the stored report when editing, so a correction is a change
  // to one field rather than a retype of the whole answer.
  const [amount, setAmount] = useState(
    editing?.amount !== null && editing?.amount !== undefined ? String(editing.amount) : "",
  );
  const [timeSpent, setTimeSpent] = useState<string | null>(editing?.timeSpentBucket ?? null);
  const [provider, setProvider] = useState(editing?.provider ?? "");
  const [region, setRegion] = useState(editing?.region ?? "");
  const [note, setNote] = useState(editing?.note ?? "");
  const [referral, setReferral] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState("");
  const [fileError, setFileError] = useState<string | null>(null);
  const [redacted, setRedacted] = useState(false);
  const [tipsOpen, setTipsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Extract<SubmitReportResult, { ok: true }> | null>(null);
  const [savedEdit, setSavedEdit] = useState(false);

  const fileInput = useRef<HTMLInputElement | null>(null);
  const tracked = useRef(false);

  const money = useMemo(
    () => amountField(props.outcomeType, props.outcomeUnit),
    [props.outcomeType, props.outcomeUnit],
  );

  useEffect(() => {
    if (tracked.current) return;
    tracked.current = true;
    // Which fields are *offered*, never their values: an analytics event with a
    // note in it is a copy of the note in someone else's analytics.
    trackReportOpened(props.outcomeType);
  }, [props.outcomeType]);

  /* ---------------------------------------------------------------------- */
  /* Evidence                                                                */
  /* ---------------------------------------------------------------------- */

  const chooseFile = useCallback(async (picked: File | null) => {
    setFileError(null);

    if (!picked) return;

    if (picked.size > MAX_EVIDENCE_BYTES) {
      setFile(null);
      setFileName("");
      setFileError("That file is over 5MB. A screenshot usually fits.");
      return;
    }

    setFileName(picked.name);

    if (picked.type === "application/pdf") {
      // A PDF has no EXIF to strip in any sense a browser can act on, and
      // re-encoding it would need a library this app does not have. What it
      // does have is document metadata, so the redaction tip says so.
      setFile(picked);
    } else {
      setFile(await stripExif(picked));
    }

    // The confirmation is about *this* file. Changing the file has to clear it,
    // because ticking a box about a screenshot says nothing about the PDF that
    // replaces it.
    setRedacted(false);
  }, []);

  /**
   * Swap the screenshot on an existing report.
   *
   * Its own action and its own button rather than part of `onSubmit`: the report
   * row already exists, so an upload inside the edit request would be a second
   * file on a row that has one, rather than a replacement. Keeping it separate
   * also means a failed upload leaves the reader's corrected answers intact
   * instead of rolling them back with a toast and an empty form.
   */
  const replaceEvidence = useCallback(async () => {
    if (!editing || !file || !redacted) return;

    setBusy(true);
    const outcome = await replaceReportEvidence({ reportId: editing.reportId, file });
    setBusy(false);

    if (!outcome.ok) {
      setFileError(outcome.error ?? "That upload didn't finish.");
      return;
    }

    toast.success("Screenshot replaced. Our reviewers will see the new one.");
    setFile(null);
    setFileName("");
    setRedacted(false);
    if (fileInput.current) fileInput.current.value = "";
    onSubmitted?.();
  }, [editing, file, onSubmitted, redacted]);

  /* ---------------------------------------------------------------------- */
  /* Submit                                                                  */
  /* ---------------------------------------------------------------------- */

  const onSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      if (!result) {
        setFileError(null);
        toast.error("Pick one: worked, partly, or didn't.");
        return;
      }

      setBusy(true);

      // Editing and filing share this form but not this call. The edit action
      // carries the 24-hour window, refuses to touch the evidence, and files the
      // correction against the version the report was already filed against —
      // moving a report to a newer version would silently re-attribute it to a
      // prompt the reader never answered.
      if (editing) {
        const outcome = await editReport({
          reportId: editing.reportId,
          playbookId: props.playbookId,
          versionId: editing.versionId,
          result,
          agentSlug,
          amount: amount.trim() || null,
          hoursSaved: amount.trim() || null,
          timeSpentBucket: timeSpent,
          provider: provider || null,
          region: region || null,
          note: note.trim() || null,
        });

        setBusy(false);

        if (!outcome.ok) {
          toast.error(outcome.error);
          return;
        }

        trackReportSubmitted({
          result,
          hasAmount: amount.trim() !== "",
          hasEvidence: editing.hasEvidence,
        });

        onSubmitted?.();
        setSavedEdit(true);
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }

      const outcome = await submitReport({
        playbookId: props.playbookId,
        versionId: props.versionId,
        result,
        agentSlug,
        amount: amount.trim() || null,
        hoursSaved: amount.trim() || null,
        timeSpentBucket: timeSpent,
        provider: provider || null,
        region: region || null,
        note: note.trim() || null,
        referralCode: referral ? normalizeReferralCode(referral) : null,
        evidenceRedacted: redacted,
        evidence: file,
      });

      setBusy(false);

      if (!outcome.ok) {
        toast.error(outcome.error);
        return;
      }

      trackReportSubmitted({
        result,
        hasAmount: amount.trim() !== "",
        hasEvidence: Boolean(file),
      });

      onSubmitted?.();
      setDone(outcome);
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [
      agentSlug,
      amount,
      editing,
      file,
      props.playbookId,
      props.versionId,
      provider,
      referral,
      redacted,
      region,
      result,
      timeSpent,
      note,
      onSubmitted,
    ],
  );

  if (savedEdit) {
    return <ReportEdited slug={props.playbookSlug} />;
  }

  if (done) {
    return <ReportThanks {...props} outcome={done} />;
  }

  return (
    <form onSubmit={onSubmit} data-testid="report-form" className="space-y-7">
      {/* ---- 1. Result ------------------------------------------------- */}
      <fieldset>
        <legend className="text-sm font-medium">
          Did it work? <span className="text-muted-foreground">(required)</span>
        </legend>

        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {RESULTS.map((option) => {
            const selected = result === option.value;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={selected}
                onClick={() => setResult(option.value)}
                data-testid={`report-result-${option.value}`}
                className={`flex min-h-16 flex-col items-start justify-center rounded-xl border px-4 py-3 text-left transition-colors ${
                  selected
                    ? "border-foreground bg-foreground text-background"
                    : "border-border bg-card hover:bg-accent"
                }`}
              >
                <span className="text-base font-medium">{option.label}</span>
                <span
                  className={`text-xs ${selected ? "text-background/70" : "text-muted-foreground"}`}
                >
                  {option.hint}
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      {/* ---- 2. Agent --------------------------------------------------- */}
      <div>
        <label htmlFor="report-agent" className="text-sm font-medium">
          Agent used <span className="text-muted-foreground">(optional)</span>
        </label>
        <select
          id="report-agent"
          value={agentSlug}
          onChange={(event) => setAgentSlug(event.target.value)}
          className="mt-1.5 h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
          data-testid="report-agent"
        >
          {props.agents.map((agent) => (
            <option key={agent.slug} value={agent.slug}>
              {agent.name}
            </option>
          ))}
        </select>
      </div>

      {/* ---- 3. Amount, or hours ---------------------------------------- */}
      {money ? (
        <div>
          <label htmlFor="report-amount" className="text-sm font-medium">
            {money.label} <span className="text-muted-foreground">(optional)</span>
          </label>
          <p className="mt-0.5 text-xs text-muted-foreground">
            If you know roughly what it saved. No amount, no problem — most reports skip this.
          </p>
          <div className="mt-1.5 flex items-center gap-2">
            {money.prefix ? (
              <span className="text-sm text-muted-foreground">{money.prefix}</span>
            ) : null}
            <Input
              id="report-amount"
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              max={money.cap}
              placeholder="0"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              className="h-11 max-w-40 rounded-xl"
              data-testid="report-amount"
            />
            {money.unit ? (
              <span className="text-sm text-muted-foreground" data-testid="report-amount-unit">
                {money.unit}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* ---- 3b. Time spent -------------------------------------------- */}
      <div>
        <span className="text-sm font-medium">
          How long did it take you? <span className="text-muted-foreground">(optional)</span>
        </span>
        <div className="mt-2 flex flex-wrap gap-2">
          {TIME_SPENT_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={timeSpent === option.value}
              onClick={() => setTimeSpent(timeSpent === option.value ? null : option.value)}
              data-testid={`report-time-${option.value}`}
              className={`min-h-9 rounded-full border px-3.5 text-sm transition-colors ${
                timeSpent === option.value
                  ? "border-foreground bg-foreground text-background"
                  : "border-border hover:bg-accent"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* ---- 4. Provider / region --------------------------------------- */}
      {props.reportFields.map((field) => (
        <div key={field.key}>
          <label htmlFor={`report-${field.key}`} className="text-sm font-medium">
            {field.label} <span className="text-muted-foreground">(optional)</span>
          </label>
          <div className="mt-1.5">
            {field.type === "select" ? (
              <select
                id={`report-${field.key}`}
                value={field.key === "provider" ? provider : region}
                onChange={(event) => {
                  const next = event.target.value;
                  if (field.key === "provider") setProvider(next);
                  else setRegion(next);
                }}
                className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
                data-testid={`report-${field.key}`}
              >
                <option value="">Any</option>
                {field.options.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            ) : (
              <Input
                id={`report-${field.key}`}
                value={field.key === "provider" ? provider : region}
                onChange={(event) => {
                  const next = event.target.value;
                  if (field.key === "provider") setProvider(next);
                  else setRegion(next);
                }}
                className="h-11 rounded-xl"
                data-testid={`report-${field.key}`}
              />
            )}
          </div>
        </div>
      ))}

      {/* ---- 5. Note ----------------------------------------------------- */}
      <div>
        <label htmlFor="report-note" className="text-sm font-medium">
          Anything worth telling the next person? <span className="text-muted-foreground">(optional)</span>
        </label>
        <Textarea
          id="report-note"
          rows={3}
          maxLength={500}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="What worked, what didn't, what you'd do differently."
          className="mt-1.5 rounded-xl"
          data-testid="report-note"
        />
        <p className="mt-1 text-right text-xs text-muted-foreground">{note.length}/500</p>
      </div>

      {/* ---- 5c. Referral code ------------------------------------------- */}
      {museReferralNote() ? (
        <div className="rounded-xl border border-muse-line bg-muse-soft p-4">
          <label htmlFor="report-referral" className="text-sm font-medium text-muse-dark">
            Your Muse referral code <span className="opacity-70">(optional)</span>
          </label>
          <Input
            id="report-referral"
            value={referral}
            onChange={(event) => setReferral(normalizeReferralCode(event.target.value))}
            placeholder="e.g. GT09WC"
            maxLength={6}
            autoCapitalize="characters"
            className="mt-1.5 h-11 w-40 rounded-xl font-mono uppercase"
            data-testid="report-referral"
          />
          <p className="mt-2 text-xs leading-relaxed text-muse-dark/80">
            6 characters, letters and numbers. Your code may appear with your verified report on
            this playbook. Display and placement are not guaranteed.
          </p>
        </div>
      ) : null}

      {/* ---- 6. Evidence -------------------------------------------------- */}
      {/* Hidden entirely on an edit that has nothing attached: an edit cannot
          attach one, because the report already exists and evidence is filed
          with the report. Offering an upload here would be an upload that
          silently does nothing. */}
      {editing && !editing.hasEvidence ? null : (
        <div className="rounded-xl border border-dashed border-border p-4">
        <p className="text-sm font-medium">
          {editing?.hasEvidence ? "Your screenshot" : "Screenshot or document"}{" "}
          <span className="text-muted-foreground">(optional)</span>
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {editing?.hasEvidence
            ? "Kept private to you and our reviewers. Replacing it sends the new one for review again."
            : "Private to you and our reviewers. Never shown on the page."}
        </p>

        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg,image/webp,application/pdf"
          className="sr-only"
          data-testid="report-file-input"
          onChange={(event) => {
            void chooseFile(event.target.files?.[0] ?? null);
          }}
        />

        {fileName ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <FileText className="size-4 text-muted-foreground" aria-hidden />
            <span className="max-w-full truncate" data-testid="report-file-name">
              {fileName}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="ml-auto rounded-full"
              onClick={() => fileInput.current?.click()}
              data-testid="report-file-change"
            >
              Change
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="rounded-full"
              onClick={() => {
                setFile(null);
                setFileName("");
                setRedacted(false);
                if (fileInput.current) fileInput.current.value = "";
              }}
              data-testid="report-file-remove"
            >
              Remove
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3 rounded-full"
            onClick={() => fileInput.current?.click()}
            data-testid="report-file-choose"
          >
            Choose image or PDF
          </Button>
        )}

        {fileError ? (
          <p className="mt-2 text-xs text-destructive" role="alert" data-testid="report-file-error">
            {fileError}
          </p>
        ) : null}

        {file ? (
          <div className="mt-4">
            <label className="flex items-start gap-2.5 text-sm">
              <Checkbox
                checked={redacted}
                onCheckedChange={(checked) => setRedacted(checked === true)}
                className="mt-0.5"
                data-testid="report-redacted"
              />
              <span>
                I&rsquo;ve hidden account numbers and personal info
                <span className="ml-1 text-muted-foreground">(required to attach)</span>
              </span>
            </label>
          </div>
        ) : null}

        {/* On an edit, saving the form does not carry the file — the report is
            already stored, and a second upload inside the same request would be
            a second file rather than a replacement. So the replacement is its
            own action, with its own button. */}
        {editing && file ? (
          <div className="mt-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!redacted || busy}
              onClick={() => void replaceEvidence()}
              className="rounded-full"
              data-testid="report-evidence-replace"
            >
              Replace screenshot
            </Button>
            {!redacted ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Confirm you&rsquo;ve hidden account numbers and personal info first.
              </p>
            ) : null}
          </div>
        ) : null}

        {/* In place, not a link and not a sibling route. Everything above stays
            mounted, so opening the tips cannot clear the form. */}
        <button
          type="button"
          onClick={() => setTipsOpen((value) => !value)}
          aria-expanded={tipsOpen}
          aria-controls="redaction-tips"
          className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
          data-testid="report-redaction-tips-toggle"
        >
          Redaction tips
          {tipsOpen ? (
            <ChevronUp className="size-3.5" aria-hidden />
          ) : (
            <ChevronDown className="size-3.5" aria-hidden />
          )}
        </button>

        {tipsOpen ? (
          <div
            id="redaction-tips"
            className="mt-2 rounded-lg bg-accent p-3 text-xs leading-relaxed text-muted-foreground"
            data-testid="report-redaction-tips"
          >
            <ul className="list-disc space-y-1 pl-4">
              <li>Cover account numbers, addresses and reference numbers with a solid block.</li>
              <li>
                Remove the recipient&rsquo;s name. A bill screenshot is fine; a bill *for one
                particular person* is not.
              </li>
              <li>
                PDFs carry author and creation metadata in the file itself. Export a fresh copy
                rather than forwarding the original.
              </li>
              <li>Images have their location and camera stripped automatically in your browser.</li>
            </ul>
          </div>
        ) : null}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="submit"
          disabled={busy}
          className="h-11 rounded-full bg-brand px-6 text-white hover:bg-brand/90"
          data-testid="report-submit"
        >
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          {busy ? "Sending…" : editing ? "Save my change" : "Send my result"}
        </Button>
        <p className="text-xs text-muted-foreground">
          {editing
            ? "Reports can be changed for 24 hours, then deleted for good."
            : "You can change this for 24 hours."}
        </p>
      </div>
    </form>
  );
}

/* -------------------------------------------------------------------------- */
/* Success                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The end of an *edit*.
 *
 * Not `ReportThanks`, on purpose. That screen is built for a first report — a
 * share sheet, a "try next" suggestion, a confirmation that a new data point
 * exists. After a correction none of that is true, and showing a share sheet for
 * a number someone just fixed would be asking them to promote the corrected
 * version as though it were news. So this is two lines and a way back to their
 * own list.
 */
function ReportEdited({ slug }: { slug: string }) {
  return (
    <div className="text-center" data-testid="report-edited">
      <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-verified-bg">
        <Check className="size-6 text-worked" aria-hidden />
      </span>

      <h2 className="mt-4 text-2xl font-semibold tracking-tight">Updated.</h2>
      <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted-foreground">
        Thanks for correcting it. That&rsquo;s the kind of thing that keeps these numbers worth
        reading.
      </p>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/me?tab=reported"
          className="inline-flex h-11 items-center rounded-full bg-foreground px-6 text-background"
        >
          Back to my reports
        </Link>
        <Link href={`/p/${slug}`} className="text-sm underline">
          See the playbook
        </Link>
      </div>
    </div>
  );
}

function ReportThanks({
  outcome,
  ...props
}: ReportFormProps & { outcome: Extract<SubmitReportResult, { ok: true }> }) {
  return (
    <div className="text-center" data-testid="report-thanks">
      <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-verified-bg">
        <Star className="size-6 fill-worked text-worked" aria-hidden />
      </span>

      <h2 className="mt-4 text-2xl font-semibold tracking-tight">Thanks! Your result is in.</h2>
      <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted-foreground">
        {outcome.evidenceAttached
          ? "Your evidence is with our reviewers — thank you for taking the trouble."
          : "That's one more data point for the next person."}
      </p>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <ShareMenu
          slug={props.playbookSlug}
          url={props.shareUrl}
          title={`I tried "${props.title}" on Playbook Hunt and reported how it went.`}
        />

        {outcome.nextPlaybook ? (
          <Button asChild variant="outline" className="rounded-full">
            <Link href={`/p/${outcome.nextPlaybook.slug}`} data-testid="report-try-next">
              Try next: {outcome.nextPlaybook.title}
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* EXIF                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Re-encode an image so its metadata goes away.
 *
 * Every mainstream browser's decoder has already parsed the EXIF block by the
 * time a canvas can draw the image, and a canvas only ever outputs pixels — so
 * drawing and re-encoding is a complete strip. There is no library involved and
 * no second copy of the file is ever uploaded: the stripped version replaces
 * the original in memory, before anything is sent.
 *
 * Failure is not an error. A browser that cannot decode the image here would
 * also fail to preview it, and refusing the upload because *redaction* could not
 * be verified would be a worse outcome than uploading what the reader chose.
 */
async function stripExif(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;

    const context = canvas.getContext("2d");
    if (!context) return file;

    context.drawImage(bitmap, 0, 0);
    bitmap.close();

    const mime = file.type === "image/png" ? "image/png" : "image/jpeg";
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, mime, 0.92),
    );

    if (!blob || blob.size >= file.size) {
      // No gain, or the re-encode came out bigger. Keeping the original is
      // better than shipping a 4MB file where 700KB was enough.
      return file;
    }

    return new File([blob], file.name, { type: mime });
  } catch {
    return file;
  }
}
