import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ReportForm } from "./report-form";

/**
 * The report form's privacy rule, asserted on the payloads.
 *
 * Two different things are being checked here, and they are easy to confuse:
 *
 * 1. **No try inputs reach the server.** AGENTS.md says input values are never
 *    sent — all templating happens client-side. The report form does not even
 *    render those inputs, so the risk here is a stray field appearing in the
 *    payload, not the form asking for them.
 * 2. **What *does* go to the server is what a report is.** A result, an amount
 *    they chose to give, a note they typed. Those are the point of the form. The
 *    test therefore asserts the report payload *contains* the answer and does
 *    not contain anything from a try.
 *
 * Analytics get the opposite treatment: `report_submitted` may carry `hasAmount`
 * and `hasEvidence` — booleans about which fields were filled — and must never
 * carry the amount, the note, or the referral code. A number in analytics is a
 * copy of that number in somebody else's analytics.
 */

const SENTINEL_AMOUNT = "4321";
const SENTINEL_NOTE = "ZZNOTE-SENTINEL the provider hung up on me";

type ReportInput = Record<string, unknown>;
type SubmitResult = {
  ok: true;
  reportId: string;
  slug: string;
  title: string;
  nextPlaybook: null;
  evidenceAttached: boolean;
};

// Hoisted because `vi.mock` is hoisted above every other statement in the file.
// The signatures are given explicitly rather than inferred from the
// implementations: an implementation that ignores its argument types `calls` as
// an empty tuple, and then `calls[0][0]` — the payload these tests exist to
// read — is a type error instead of a value.
const { submitReport, editReport, replaceReportEvidence, trackReportOpened, trackReportSubmitted } =
  vi.hoisted(() => ({
    submitReport: vi.fn<(input: ReportInput) => Promise<SubmitResult>>(async () => ({
      ok: true,
      reportId: "report-1",
      slug: "lower-your-internet-bill",
      title: "Lower your internet bill",
      nextPlaybook: null,
      evidenceAttached: false,
    })),
    editReport: vi.fn<(input: ReportInput) => Promise<{ ok: true; slug: string }>>(async () => ({
      ok: true,
      slug: "lower-your-internet-bill",
    })),
    replaceReportEvidence: vi.fn<(input: ReportInput) => Promise<{ ok: true }>>(async () => ({
      ok: true,
    })),
    trackReportOpened: vi.fn<(event: Record<string, unknown>) => void>(() => undefined),
    trackReportSubmitted: vi.fn<(event: Record<string, unknown>) => void>(() => undefined),
  }));

vi.mock("@/app/actions/submit-report", () => ({ submitReport }));
vi.mock("@/app/actions/edit-report", () => ({ editReport, replaceReportEvidence }));
vi.mock("@/lib/analytics", () => ({
  trackReportOpened,
  trackReportSubmitted,
  trackSearch: vi.fn(),
  trackCardClick: vi.fn(),
  trackShare: vi.fn(),
  trackFilterChanged: vi.fn(),
}));

// `sonner` renders to a portal and is irrelevant to what is being asserted here.
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
}));

const PROPS = {
  playbookId: "0f8fad5b-d9cb-469f-a165-70867728950e",
  playbookSlug: "lower-your-internet-bill",
  versionId: "1f8fad5b-d9cb-469f-a165-70867728950e",
  title: "Lower your internet bill",
  shareUrl: "https://playbookhunt.test/p/lower-your-internet-bill",
  outcomeType: "money_monthly" as const,
  outcomeUnit: "$/mo",
  reportFields: [
    { key: "provider" as const, label: "Provider", type: "select" as const, options: ["Xfinity"] },
  ],
  agents: [{ slug: "muse", name: "Muse" }],
};

/** The whole payload, flattened to a string, for "does this text appear" checks. */
function serialise(value: unknown): string {
  return JSON.stringify(value ?? {});
}

beforeEach(() => {
  for (const mock of [
    submitReport,
    editReport,
    replaceReportEvidence,
    trackReportOpened,
    trackReportSubmitted,
  ]) {
    mock.mockClear();
  }
});

describe("ReportForm payload", () => {
  it("sends the answer, and nothing a reader typed into a playbook", async () => {
    render(<ReportForm {...PROPS} />);

    fireEvent.click(screen.getByText("Worked"));
    fireEvent.change(screen.getByTestId("report-amount"), {
      target: { value: SENTINEL_AMOUNT },
    });
    fireEvent.change(screen.getByTestId("report-note"), { target: { value: SENTINEL_NOTE } });

    fireEvent.click(screen.getByTestId("report-submit"));

    await waitFor(() => expect(submitReport).toHaveBeenCalledTimes(1));

    const payload = submitReport.mock.calls[0]![0] as ReportInput;

    expect(payload.result).toBe("worked");
    expect(payload.amount).toBe(SENTINEL_AMOUNT);
    expect(payload.note).toBe(SENTINEL_NOTE);
    // Referral codes are display-only on verified reports and read by nothing in
    // the ranking, so it travels as its own column — and it is null here because
    // the field is gated on a terms URL we have not published yet.
    expect(payload.referralCode).toBeNull();

    // The keys are the whole claim: there is no field through which an input
    // value from the try panel could arrive.
    expect(Object.keys(payload).sort()).toEqual([
      "agentSlug",
      "amount",
      "evidence",
      "evidenceRedacted",
      "hoursSaved",
      "note",
      "playbookId",
      "provider",
      "referralCode",
      "region",
      "result",
      "timeSpentBucket",
      "versionId",
    ]);
  });

  it("sends no provider or region that the playbook never offered", async () => {
    render(<ReportForm {...PROPS} />);

    fireEvent.click(screen.getByText("Worked"));
    fireEvent.click(screen.getByTestId("report-submit"));

    await waitFor(() => expect(submitReport).toHaveBeenCalledTimes(1));

    const payload = submitReport.mock.calls[0]![0] as ReportInput;
    expect(payload.provider).toBeNull();
    expect(payload.region).toBeNull();
  });

  it("submits with only a result, because only the result is required", async () => {
    render(<ReportForm {...PROPS} />);

    fireEvent.click(screen.getByText("Didn't"));
    fireEvent.click(screen.getByTestId("report-submit"));

    await waitFor(() => expect(submitReport).toHaveBeenCalledTimes(1));

    const payload = submitReport.mock.calls[0]![0] as ReportInput;
    expect(payload.result).toBe("didnt");
    expect(payload.amount).toBeNull();
    expect(payload.note).toBeNull();
  });

  it("does not submit until a result is chosen", async () => {
    render(<ReportForm {...PROPS} />);

    fireEvent.click(screen.getByTestId("report-submit"));
    await Promise.resolve();

    expect(submitReport).not.toHaveBeenCalled();
  });
});

describe("ReportForm analytics", () => {
  it("reports which fields were filled, never what was in them", async () => {
    render(<ReportForm {...PROPS} />);

    fireEvent.click(screen.getByText("Partly"));
    fireEvent.change(screen.getByTestId("report-amount"), { target: { value: SENTINEL_AMOUNT } });
    fireEvent.change(screen.getByTestId("report-note"), { target: { value: SENTINEL_NOTE } });
    fireEvent.click(screen.getByTestId("report-submit"));

    await waitFor(() => expect(trackReportSubmitted).toHaveBeenCalledTimes(1));

    const event = trackReportSubmitted.mock.calls[0]![0] as Record<string, unknown>;
    expect(event).toEqual({ result: "partly", hasAmount: true, hasEvidence: false });

    // The strongest form of the assertion: no sentinel value appears anywhere in
    // the analytics call, including as a substring of a longer string.
    const dumped = serialise(trackReportSubmitted.mock.calls);
    expect(dumped).not.toContain(SENTINEL_AMOUNT);
    expect(dumped).not.toContain(SENTINEL_NOTE);
    expect(dumped).not.toContain("ZZNOTE-SENTINEL");
  });

  it("reports the outcome type on open, and no field values", async () => {
    render(<ReportForm {...PROPS} />);

    await waitFor(() => expect(trackReportOpened).toHaveBeenCalled());

    const dumped = serialise(trackReportOpened.mock.calls);
    expect(dumped).toContain("money_monthly");
    expect(dumped).not.toContain(SENTINEL_AMOUNT);
    expect(dumped).not.toContain(SENTINEL_NOTE);
  });

  it("reports hasEvidence false when a file is not attached", async () => {
    render(<ReportForm {...PROPS} />);

    fireEvent.click(screen.getByText("Worked"));
    fireEvent.click(screen.getByTestId("report-submit"));

    await waitFor(() => expect(trackReportSubmitted).toHaveBeenCalledTimes(1));
    expect((trackReportSubmitted.mock.calls[0]![0] as { hasEvidence: boolean }).hasEvidence).toBe(
      false,
    );
  });
});

describe("ReportForm editing", () => {
  const editing = {
    reportId: "3f8fad5b-d9cb-469f-a165-70867728950e",
    versionId: "9f8fad5b-d9cb-469f-a165-70867728950e",
    result: "partly" as const,
    amount: 12,
    timeSpentBucket: null,
    provider: "Xfinity",
    region: null,
    note: "It helped a bit.",
    agentSlug: "muse",
    hasEvidence: false,
  };

  it("calls the edit action, not the submit action", async () => {
    render(<ReportForm {...PROPS} editing={editing} />);

    fireEvent.click(screen.getByTestId("report-submit"));

    await waitFor(() => expect(editReport).toHaveBeenCalledTimes(1));
    expect(submitReport).not.toHaveBeenCalled();
  });

  it("prefills from the stored report, so a correction is a change to one field", () => {
    render(<ReportForm {...PROPS} editing={editing} />);

    expect((screen.getByTestId("report-amount") as HTMLInputElement).value).toBe("12");
    expect((screen.getByTestId("report-note") as HTMLTextAreaElement).value).toBe("It helped a bit.");
    expect(screen.getByText("Partly").closest("button")).toHaveAttribute("aria-pressed", "true");
  });

  it("files the correction against the report's own version, not the current one", async () => {
    render(<ReportForm {...PROPS} editing={editing} />);

    fireEvent.click(screen.getByTestId("report-submit"));
    await waitFor(() => expect(editReport).toHaveBeenCalledTimes(1));

    const payload = editReport.mock.calls[0]![0] as Record<string, unknown>;
    // Moving a report onto a newer version would attribute an answer to a prompt
    // the reader never answered.
    expect(payload.versionId).toBe(editing.versionId);
    expect(payload.versionId).not.toBe(PROPS.versionId);
    expect(payload.reportId).toBe(editing.reportId);
  });

  it("confirms rather than showing the share screen", async () => {
    render(<ReportForm {...PROPS} editing={editing} />);

    fireEvent.click(screen.getByTestId("report-submit"));

    await waitFor(() => expect(screen.getByTestId("report-edited")).toBeInTheDocument());
    expect(screen.queryByTestId("report-thanks")).not.toBeInTheDocument();
  });

  it("sends no evidence and no referral code on an edit", async () => {
    render(<ReportForm {...PROPS} editing={editing} />);

    fireEvent.click(screen.getByTestId("report-submit"));
    await waitFor(() => expect(editReport).toHaveBeenCalledTimes(1));

    const payload = serialise(editReport.mock.calls[0]);
    // A second upload inside the edit would be a second file on a row that has
    // one; the replacement is its own action.
    expect(payload).not.toContain("evidence");
    expect(payload).not.toContain("referralCode");
  });
});