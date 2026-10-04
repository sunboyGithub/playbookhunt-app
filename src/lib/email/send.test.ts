import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `sendEmail` is called from inside a loop by the cron route, and its return
 * value decides whether a follow-up row is stamped `sent_at`. That makes "did
 * not throw" the contract and the reason the important part: a thrown error
 * would take down the whole batch, and a swallowed one would mark an email as
 * delivered that never left.
 */

const ENV = {
  NEXT_PUBLIC_SITE_URL: "https://playbookhunt.test",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
};

const message = {
  to: "reader@example.test",
  subject: "Did it work?",
  html: "<p>hello</p>",
  text: "hello",
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  for (const [key, value] of Object.entries(ENV)) process.env[key] = value;

  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.RESEND_API_KEY;
  delete process.env.RESEND_FROM;
});

async function load() {
  return import("@/lib/email/send");
}

describe("sendEmail", () => {
  it("reports that it never tried when no API key is set", async () => {
    const { sendEmail } = await load();
    const outcome = await sendEmail(message);

    expect(outcome.sent).toBe(false);
    expect(outcome.reason).toMatch(/RESEND_API_KEY/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports that it never tried when no from address is set", async () => {
    process.env.RESEND_API_KEY = "re_test";
    const { sendEmail } = await load();

    const outcome = await sendEmail(message);
    expect(outcome.sent).toBe(false);
    expect(outcome.reason).toMatch(/RESEND_FROM/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts the rendered message and returns the provider's id", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.RESEND_FROM = "PlaybookHunt <hello@playbookhunt.test>";

    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: "res_123" }),
    });

    const { sendEmail } = await load();
    const outcome = await sendEmail(message);

    expect(outcome).toEqual({ sent: true, id: "res_123" });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer re_test");

    const body = JSON.parse(init.body);
    expect(body).toMatchObject({
      from: "PlaybookHunt <hello@playbookhunt.test>",
      to: ["reader@example.test"],
      subject: "Did it work?",
    });
    // Both alternatives, or clients that pick one will drop the unsubscribe.
    expect(body.html).toBe("<p>hello</p>");
    expect(body.text).toBe("hello");
  });

  it("returns the provider's status and a truncated reason on refusal", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.RESEND_FROM = "hello@playbookhunt.test";

    fetchMock.mockResolvedValue({
      ok: false,
      status: 422,
      text: async () => "x".repeat(5000),
    });

    const { sendEmail } = await load();
    const outcome = await sendEmail(message);

    expect(outcome.sent).toBe(false);
    expect(outcome.reason).toMatch(/^422: /);
    // An error body can be a whole HTML page, and it ends up in a log somebody
    // has to read.
    expect((outcome.reason ?? "").length).toBeLessThan(230);
  });

  it("turns a network error into a reason rather than an exception", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.RESEND_FROM = "hello@playbookhunt.test";

    fetchMock.mockRejectedValue(new Error("ECONNRESET"));

    const { sendEmail } = await load();
    const outcome = await sendEmail(message);

    expect(outcome).toEqual({ sent: false, reason: "ECONNRESET" });
  });

  it("counts as sent even when the response body is not JSON", async () => {
    // The provider accepted it; only our read of the id failed. Reporting a
    // failure here would leave the row unstamped and send the reminder twice.
    process.env.RESEND_API_KEY = "re_test";
    process.env.RESEND_FROM = "hello@playbookhunt.test";

    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error("not json");
      },
    });

    const { sendEmail } = await load();
    const outcome = await sendEmail(message);

    expect(outcome.sent).toBe(true);
    expect(outcome.id).toBeUndefined();
  });
});