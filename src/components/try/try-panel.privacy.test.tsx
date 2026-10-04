import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TryPanel } from "./try-panel";
import { toTryFields, type TryField } from "@/lib/try/fields";

/**
 * The privacy requirement, asserted on the payloads rather than on the prose.
 *
 * AGENTS.md: "Never send input values to our server or analytics — all
 * templating happens client-side." That is easy to state and easy to break: any
 * action that took a field value would still log correctly and still pass a test
 * that only checked the prompt rendered.
 *
 * So the two server actions are mocked, the form is filled with values chosen to
 * be unmissable, and every argument they are called with is inspected. The test
 * fails if any reader input reaches a server boundary — which is a different and
 * much stronger claim than "the prompt looks right".
 */

/** Sentinel values. Absurd on purpose: nothing real could coincide with them. */
const SECRETS = {
  provider: "ZZPROVIDER-SENTINEL",
  // A `money` field renders as `type="number"`, so a sentinel containing a `$`
  // or any letter is rejected by the input itself and never reaches the form.
  // The marker is the digits instead.
  price: "999999999987",
  zip: "ZZZIP-SENTINEL",
  bill: "ZZBILL-SENTINEL-LINE-1\nZZBILL-SENTINEL-LINE-2",
} as const;

// `vi.mock` is hoisted above every other statement in the file, so a factory
// that closed over a `const` declared here would run before that const exists.
// `vi.hoisted` lifts the mocks themselves into the same hoisted scope, which
// keeps them inspectable from the tests without breaking the hoisting.
type LogTryEventInput = {
  playbookId: string;
  versionId: string | null;
  agentSlug: string | null;
  action: string;
};

type CreateFollowupInput = { playbookId: string; tryEventId: string | null };

// Typed to mirror the real actions' parameters, so `mock.calls` is a tuple of
// real argument shapes rather than `[]` and the payload assertions below stay
// type-checked. `vi.hoisted` because `vi.mock` is hoisted above every other
// statement in the file.
const { logTryEvent, createFollowup } = vi.hoisted(() => ({
  // The parameters are declared but never read: they exist so that `mock.calls`
  // is typed as a tuple of real argument shapes, which is what makes the payload
  // assertions below type-checked rather than `any`.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  logTryEvent: vi.fn(async (input: LogTryEventInput) => ({ id: "try-event-1" as string | null })),
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  createFollowup: vi.fn(async (input: CreateFollowupInput) => ({ created: true })),
}));

vi.mock("@/app/actions/log-try-event", () => ({ logTryEvent }));
vi.mock("@/app/actions/create-followup", () => ({ createFollowup }));

const AGENT = {
  id: "22222222-2222-2222-2222-222222222222",
  slug: "muse",
  display_name: "Muse",
  capabilities: ["info", "web_actions"],
  // Null in the real database today, which is why the button copies rather than
  // prefilling. Setting it here would exercise the other branch.
  launch_url_template: null,
  home_url: "https://muse.ai",
  status: "active",
} as unknown as Parameters<typeof TryPanel>[0]["selectableAgents"][number];

const FIELDS: TryField[] = toTryFields([
  {
    id: "33333333-3333-3333-3333-333333333333",
    key: "provider",
    label: "Provider",
    type: "provider_picker",
    options: ["Xfinity", SECRETS.provider],
    required: true,
    help: null,
    why_it_helps: null,
  },
  {
    id: "44444444-4444-4444-4444-444444444444",
    key: "price",
    label: "Monthly price",
    type: "money",
    options: null,
    required: false,
    help: null,
    why_it_helps: "better offers",
  },
  {
    id: "55555555-5555-5555-5555-555555555555",
    key: "zip",
    label: "ZIP code",
    type: "zip",
    options: null,
    required: false,
    help: null,
    why_it_helps: "finds local offers",
  },
  {
    id: "66666666-6666-6666-6666-666666666666",
    key: "bill",
    label: "Your latest bill",
    type: "textarea",
    options: null,
    required: false,
    help: null,
    why_it_helps: "makes the prompt most accurate",
  },
]);

const PROMPT = "My provider is {{provider}} at {{price}}, zip {{zip}}.\n{{bill}}";

function renderPanel(overrides: Partial<Parameters<typeof TryPanel>[0]> = {}) {
  return render(
    <TryPanel
      playbookId="11111111-1111-1111-1111-111111111111"
      playbookSlug="lower-your-internet-bill"
      versionId="77777777-7777-7777-7777-777777777777"
      promise="Lower your internet bill."
      inputs={FIELDS}
      promptTemplate={PROMPT}
      steps={[{ body: "Open the provider's site." }]}
      selectableAgents={[AGENT]}
      comingSoonAgents={[]}
      recommendedEvidence="68% worked (n=412)"
      signedIn={false}
      {...overrides}
    />,
  );
}

/** Everything the mocked actions were called with, flattened to a string. */
function everyActionArgument(): string {
  return JSON.stringify([...logTryEvent.mock.calls, ...createFollowup.mock.calls]);
}

/**
 * Fill every field and copy, using `fireEvent` rather than `user-event`.
 *
 * `user-event` is not a dependency here, and it is not needed: these assertions
 * are about which values reach a server action, not about whether a real
 * browser would accept the input. `fireEvent.change` is what React's onChange
 * handler is driven by either way.
 */
async function fillAndCopy() {
  fireEvent.click(screen.getByRole("button", { name: SECRETS.provider }));
  fireEvent.change(screen.getByLabelText(/monthly price/i), { target: { value: SECRETS.price } });
  fireEvent.change(screen.getByLabelText(/zip code/i), { target: { value: SECRETS.zip } });
  fireEvent.change(screen.getByLabelText(/latest bill/i), { target: { value: SECRETS.bill } });

  // Copy is async: the clipboard write and the fire-and-forget action both
  // resolve after the click handler returns, so the state updates they cause
  // land outside React's act scope unless the tick is awaited here.
  await act(async () => {
    fireEvent.click(screen.getByTestId("try-copy"));
  });
}

describe("try flow privacy", () => {
  beforeEach(() => {
    logTryEvent.mockClear();
    createFollowup.mockClear();

    // The clipboard is unavailable in jsdom; the panel falls back to a
    // textarea + execCommand, which jsdom also does not implement. Neither is
    // under test here.
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn(async () => undefined) },
    });

    // jsdom has no window.open; the panel opens a new tab when there is no
    // verified prefill URL, which is the branch Muse takes today.
    vi.spyOn(window, "open").mockReturnValue(null);
  });

  it("sends no input value to a server action when the prompt is copied", async () => {
    renderPanel();

    await fillAndCopy();

    await waitFor(() => expect(logTryEvent).toHaveBeenCalled());

    await act(async () => {
      fireEvent.click(screen.getByTestId("try-open"));
    });

    await waitFor(() =>
      expect(logTryEvent.mock.calls.some(([arg]) => arg.action === "opened")).toBe(true),
    );

    const sent = everyActionArgument();

    for (const [key, secret] of Object.entries(SECRETS)) {
      expect(sent, `"${key}" must not reach a server action`).not.toContain(secret);
    }

    // Not merely absent by luck of formatting: the payload must consist only of
    // the identifiers the actions accept.
    for (const [arg] of logTryEvent.mock.calls) {
      expect(Object.keys(arg).sort()).toEqual([
        "action",
        "agentSlug",
        "playbookId",
        "versionId",
      ]);
    }
  });

  it("still puts the values in the prompt, in the browser", async () => {
    renderPanel();

    await fillAndCopy();

    const prompt = screen.getByTestId("try-prompt").textContent ?? "";

    // The converse of the test above, so the privacy assertion cannot pass by
    // the form simply not working.
    expect(prompt).toContain(SECRETS.provider);
    expect(prompt).toContain(SECRETS.price);
    expect(prompt).toContain(SECRETS.zip);
    expect(prompt).toContain("ZZBILL-SENTINEL-LINE-1");
  });

  it("logs only ids and the action name", async () => {
    renderPanel({ signedIn: true });

    await fillAndCopy();

    await waitFor(() => expect(logTryEvent).toHaveBeenCalled());

    const [started] = logTryEvent.mock.calls[0];

    expect(started).toEqual({
      playbookId: "11111111-1111-1111-1111-111111111111",
      versionId: "77777777-7777-7777-7777-777777777777",
      // A slug, resolved to an id server-side — never anything the reader typed.
      agentSlug: "muse",
      action: "started",
    });

    // Signed in, so the follow-up is scheduled; it takes ids only.
    await waitFor(() => expect(createFollowup).toHaveBeenCalled());
    const [followup] = createFollowup.mock.calls[0];
    expect(Object.keys(followup).sort()).toEqual(["playbookId", "tryEventId"]);
  });
});