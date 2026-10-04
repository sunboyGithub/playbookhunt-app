/**
 * The report form's shape, derived from the playbook.
 *
 * Pure and server-safe on purpose: the report page is a Server Component and
 * needs to know whether the form asks for money or hours, and a client-only
 * module cannot be called from one — the same trap `toTryFields` was extracted
 * out of in P7, where a `toTryFields()` call from a server component passed
 * `pnpm build` and then 500'd in development.
 *
 * Two things here are worth reading before changing them.
 *
 * **The amount cap is a data-integrity rule, not a UX rule.** A reported
 * amount feeds the median, and the median is published at ten amounts. One
 * typo of five digits therefore moves a number this site shows to strangers, so
 * a figure above the cap is not rejected outright — it is *accepted and
 * flagged* (`is_outlier`, `status = 'pending'`), which is what the brief asks
 * for. Rejecting it would push the person to enter something they do not
 * believe in order to get an error to go away.
 *
 * **The referral code never reaches the amount or the result.** It is a
 * separate column, displayed only on verified reports, and nothing in the
 * ranking reads it (AGENTS.md).
 */

export type OutcomeType = "money_monthly" | "money_yearly" | "money_once" | "time_hours" | "binary";

export const RESULTS = [
  { value: "worked", label: "Worked", hint: "It did what it promised", tone: "worked" },
  { value: "partly", label: "Partly", hint: "Some of it worked", tone: "partly" },
  { value: "didnt", label: "Didn't", hint: "It didn't help", tone: "didnt" },
] as const;

export type ReportResult = (typeof RESULTS)[number]["value"];

export const TIME_SPENT_OPTIONS = [
  { value: "lt15", label: "< 15 min" },
  { value: "15_30", label: "15–30 min" },
  { value: "30_60", label: "30–60 min" },
  { value: "1_2h", label: "1–2 hrs" },
  { value: "2h_plus", label: "2 hrs+" },
] as const;

/**
 * The sanity ceiling per outcome type, in the unit the playbook stores.
 *
 * Deliberately generous — these are "you did not type the wrong row" limits,
 * not plausible maxima. $5,000/month of savings is beyond anything a telecom
 * will do; $500,000 is a typo.
 */
export const AMOUNT_CAPS: Record<OutcomeType, number> = {
  money_monthly: 5_000,
  money_yearly: 100_000,
  money_once: 100_000,
  time_hours: 2_000,
  // Binary playbooks have no amount at all. Zero means "the field is not
  // offered", which is why it is checked rather than compared.
  binary: 0,
};

/**
 * How the outcome field is presented for a playbook.
 *
 * `unit` comes from the playbook's own `outcome.unit` ("$/mo", "$/yr", "hrs"),
 * so the label matches how the rest of the site describes this playbook rather
 * than being restated here and drifting from it.
 */
export function amountField(outcomeType: OutcomeType | null, unit: string | null): {
  key: "amount" | "hours_saved";
  label: string;
  unit: string;
  prefix: string;
  cap: number;
} | null {
  if (outcomeType === "time_hours") {
    return {
      key: "hours_saved",
      label: "Hours saved",
      unit: unit || "hrs",
      prefix: "",
      cap: AMOUNT_CAPS.time_hours,
    };
  }

  if (outcomeType === null || outcomeType === "binary") {
    return null;
  }

  return {
    key: "amount",
    label: "Amount saved",
    unit: unit || "",
    prefix: "$",
    cap: AMOUNT_CAPS[outcomeType],
  };
}

/* -------------------------------------------------------------------------- */
/* Provider / region                                                          */
/* -------------------------------------------------------------------------- */

export type ReportField = {
  /** `provider` or `region` — the only two columns `outcome_reports` has. */
  key: "provider" | "region";
  label: string;
  type: "select" | "text";
  options: string[];
};

/** `provider` and `region`, because those are the columns that exist. */
const REPORT_FIELD_KEYS = new Set(["provider", "region"]);

/** A key turned into a readable label: `provider` → "Provider". */
function humanise(key: string): string {
  const spaced = key.replace(/[_-]+/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * The extra questions a playbook asks on the report form.
 *
 * Read from `playbooks.report_fields`, which is jsonb and therefore arbitrary.
 * Every field is validated here rather than trusted: an unknown key is dropped
 * (there is no column to put it in), a non-string option is dropped, and an
 * options list that is present but not an array of strings renders as free text
 * instead of as a select with no choices — a select whose options are all
 * missing is a dead end.
 */
export function reportFieldsFrom(raw: unknown): ReportField[] {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return [];
  }

  const fields: ReportField[] = [];

  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!REPORT_FIELD_KEYS.has(key)) continue;

    const spec = (typeof value === "object" && value !== null ? value : {}) as Record<
      string,
      unknown
    >;

    const options = Array.isArray(spec.options)
      ? spec.options.filter((option): option is string => typeof option === "string")
      : [];

    fields.push({
      key: key as ReportField["key"],
      label: typeof spec.label === "string" && spec.label ? spec.label : humanise(key),
      type: options.length > 0 ? "select" : "text",
      options,
    });
  }

  // A stable order regardless of how the jsonb was written, so the form does not
  // reshuffle between two renders of the same playbook.
  return fields.sort((a, b) => a.key.localeCompare(b.key));
}

/* -------------------------------------------------------------------------- */
/* Referral code                                                              */
/* -------------------------------------------------------------------------- */

/** The brief's rule, written out once so the input and the server cannot differ. */
export const REFERRAL_CODE_PATTERN = /^[A-Z0-9]{6}$/;

export function normalizeReferralCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}

/* -------------------------------------------------------------------------- */
/* Evidence                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The brief's 5MB, against a bucket that allows 10MB.
 *
 * Two different limits on purpose. The bucket's is a backstop against a
 * mis-typed `file_size_limit`; this one is what the reader is told, because a
 * limit nobody warned them about is the one they hit. A file over it is refused
 * in the browser, before anything is sent.
 */
export const MAX_EVIDENCE_BYTES = 5 * 1024 * 1024;

export const EVIDENCE_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf",
] as const;

export type EvidenceKind = "image" | "pdf";

export function evidenceKind(file: { type: string; name: string }): EvidenceKind | null {
  if ((EVIDENCE_MIME_TYPES as readonly string[]).includes(file.type)) {
    return file.type === "application/pdf" ? "pdf" : "image";
  }
  // Some browsers report an empty type for a file whose extension they do not
  // recognise, which would otherwise reject a perfectly good PDF.
  if (file.type === "" && /\.pdf$/i.test(file.name)) {
    return "pdf";
  }
  return null;
}

/** "image/jpeg" → "jpg". Extensions only, never a user-supplied filename. */
export function evidenceExtension(kind: EvidenceKind, mimeType: string): string {
  if (kind === "pdf") return "pdf";
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return "jpg";
}

/* -------------------------------------------------------------------------- */
/* Saving / editing                                                           */
/* -------------------------------------------------------------------------- */

/** The window the schema's UPDATE policy enforces, mirrored for the copy. */
export const REPORT_EDIT_WINDOW_HOURS = 24;