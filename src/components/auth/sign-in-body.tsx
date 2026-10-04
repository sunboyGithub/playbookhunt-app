"use client";

import { useCallback, useState } from "react";
import { usePathname } from "next/navigation";
import { Mail, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import {
  encodePendingAction,
  rememberPendingAction,
  safeReturnTo,
  type PendingActionKind,
} from "@/lib/auth/pending-action";

/**
 * The sign-in body: three ways in, one step.
 *
 * Shared by the modal and by `/login` rather than written twice, because the
 * copy is the product here. "Sign up" and "Sign in" are the same step — a new
 * address creates the account — and two versions of this panel would drift into
 * offering a password on one and not the other.
 *
 * ## The pending action
 *
 * Whenever this panel is opened *because* something needed an account, the
 * caller passes `reason` (and usually a `playbookId`). That is stored, and
 * carried into the redirect URL, so the reader lands back where they were with
 * the thing they were doing already done — see `lib/auth/pending-action`.
 *
 * Opened from the header, `reason` is absent and there is nothing to resume,
 * which is why the storage writes are conditional rather than always-on.
 */

/** Context titles, verbatim from the brief. */
const TITLES: Record<PendingActionKind, string> = {
  save: "Sign in to save this playbook",
  report: "Sign in to report your result",
  create: "Sign in to create a playbook",
  reminder: "Sign in to get a reminder",
};

const SUBTITLES: Record<PendingActionKind, string> = {
  save: "Save playbooks, get a “did it work?” reminder, and report results in one tap. Free.",
  report: "Your result is what turns one person's try into evidence for the next person.",
  create: "Publishing a playbook is free, and every playbook goes through review first.",
  reminder: "We'll email you once, a few days after you try it. No more than that.",
};

type SignInBodyProps = {
  reason?: PendingActionKind;
  playbookId?: string | null;
  /** Overrides the current path. Used by the one-click follow-up links. */
  returnTo?: string;
};

export function SignInBody({ reason, playbookId = null, returnTo }: SignInBodyProps) {
  const pathname = usePathname();

  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "google" | "facebook" | "email">(null);
  const [error, setError] = useState<string | null>(null);

  const title = reason ? TITLES[reason] : "Sign in to Playbook Hunt";

  /**
   * Where the provider should send the browser back to.
   *
   * `/auth/callback` rather than the page itself: the code exchange has to
   * happen on the server, where it can write cookies, and a Server Component
   * cannot. The callback then redirects to `returnTo`.
   */
  const callbackFor = useCallback(() => {
    const back = safeReturnTo(returnTo ?? pathname ?? "/");
    const pending =
      reason === undefined
        ? null
        : encodePendingAction({
            action: reason,
            playbookId,
            returnTo: back,
            // Read at the moment of the click, not at render: a panel that has
            // been open a while is not necessarily where the reader was.
            scrollY: typeof window === "undefined" ? 0 : window.scrollY,
          });

    if (pending) {
      rememberPendingAction({
        action: reason!,
        playbookId,
        returnTo: back,
        scrollY: typeof window === "undefined" ? 0 : window.scrollY,
      });
    }

    const url = new URL("/auth/callback", window.location.origin);
    if (pending) url.searchParams.set("pa", pending);
    return url.toString();
  }, [pathname, playbookId, reason, returnTo]);

  const oauth = useCallback(
    async (provider: "google" | "facebook") => {
      setBusy(provider);
      setError(null);

      const supabase = createClient();
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: callbackFor() },
      });

      // No navigation on success — the browser leaves the page. Reaching the
      // next line means the provider refused, and the reason is worth saying.
      if (oauthError) {
        setError(
          provider === "facebook"
            ? "Facebook sign-in didn't start. Email sign-in works without an account with them."
            : "Google sign-in didn't start. Email sign-in works without an account with Google.",
        );
        setBusy(null);
      }
    },
    [callbackFor],
  );

  const sendLink = useCallback(async () => {
    const address = email.trim();
    if (!address) {
      setError("Enter your email address.");
      return;
    }

    setBusy("email");
    setError(null);

    const supabase = createClient();
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: address,
      options: {
        emailRedirectTo: callbackFor(),
        // Sign-up and sign-in are the same step: an address that has no account
        // gets one. This is the line that makes them the same step.
        shouldCreateUser: true,
      },
    });

    setBusy(null);

    if (otpError) {
      setError(otpError.message);
      return;
    }

    setSentTo(address);
  }, [callbackFor, email]);

  if (sentTo) {
    return (
      <div className="flex flex-col items-center px-6 py-10 text-center" data-testid="check-email">
        <span className="flex size-12 items-center justify-center rounded-full bg-accent">
          <Mail className="size-6" aria-hidden />
        </span>

        <h2 className="mt-4 text-xl font-semibold">Check your email</h2>
        <p className="mt-1.5 max-w-xs text-sm text-muted-foreground">
          We sent a sign-in link to <strong className="font-medium text-foreground">{sentTo}</strong>.
          It expires in 15 minutes.
        </p>

        <div className="mt-5 flex flex-wrap items-center justify-center gap-4 text-sm">
          <button
            type="button"
            onClick={() => {
              setSentTo(null);
            }}
            className="font-medium text-brand hover:underline"
            data-testid="resend-link"
          >
            Resend link
          </button>
          {/* Goes back to the address field with the old address still in it, so
              a typo is a correction rather than a retype. */}
          <button
            type="button"
            onClick={() => {
              setSentTo(null);
            }}
            className="text-muted-foreground hover:text-foreground"
            data-testid="use-different-email"
          >
            Use a different email
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-6 py-8">
      <span className="flex size-11 items-center justify-center rounded-full bg-muse-soft">
        <Sparkles className="size-5 text-muse" aria-hidden />
      </span>

      <h2 className="mt-4 text-2xl font-semibold tracking-tight">{title}</h2>
      <p className="mt-1.5 text-sm text-muted-foreground">
        {reason ? SUBTITLES[reason] : "One step. No password, whichever way you choose."}
      </p>

      <div className="mt-6 space-y-2.5">
        <Button
          variant="outline"
          className="h-11 w-full justify-center rounded-xl"
          onClick={() => void oauth("google")}
          disabled={busy !== null}
          data-testid="signin-google"
        >
          <GoogleMark />
          {busy === "google" ? "Opening Google…" : "Continue with Google"}
        </Button>

        {/* The Meta blue the brief specifies, not a brand tint. */}
        <Button
          className="h-11 w-full justify-center rounded-xl bg-[#1877F2] text-white hover:bg-[#1668d4]"
          onClick={() => void oauth("facebook")}
          disabled={busy !== null}
          data-testid="signin-facebook"
        >
          <FacebookMark />
          {busy === "facebook" ? "Opening Facebook…" : "Continue with Facebook"}
        </Button>
      </div>

      <div className="my-5 flex items-center gap-3" aria-hidden>
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs text-muted-foreground">or</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void sendLink();
        }}
      >
        <label htmlFor="signin-email" className="sr-only">
          Email address
        </label>
        <Input
          id="signin-email"
          type="email"
          autoComplete="email"
          inputMode="email"
          placeholder="you@example.com"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            if (error) setError(null);
          }}
          className="h-11 rounded-xl"
          data-testid="signin-email"
        />

        <Button
          type="submit"
          className="mt-3 h-11 w-full justify-center rounded-xl bg-brand text-white hover:bg-brand/90"
          disabled={busy !== null}
          data-testid="signin-submit"
        >
          {busy === "email" ? "Sending…" : "Email me a sign-in link"}
        </Button>
      </form>

      {error ? (
        <p className="mt-3 text-sm text-destructive" role="alert" data-testid="signin-error">
          {error}
        </p>
      ) : null}

      <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
        New here? This creates your free account, no password needed. By continuing you agree to the{" "}
        <a href="/terms" className="underline hover:text-foreground">
          Terms
        </a>{" "}
        and{" "}
        <a href="/privacy" className="underline hover:text-foreground">
          Privacy Policy
        </a>
        .
      </p>
    </div>
  );
}

/**
 * The Google wordmark's G, drawn rather than fetched.
 *
 * An inline SVG keeps the button working with no network request and no icon
 * font, and the four-colour G is Google's brand asset — it is reproduced here
 * because the brief requires that exact button, and it identifies the provider
 * to the reader rather than decorating the control.
 */
function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4.5" aria-hidden focusable="false">
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47a5.54 5.54 0 0 1-2.4 3.63v3.02h3.86c2.26-2.09 3.56-5.17 3.56-8.89Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.08 7.93-2.91l-3.86-3.01c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.13A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.28a7.2 7.2 0 0 1 0-4.56V6.59H1.29a12 12 0 0 0 0 10.82l3.98-3.13Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.43-3.43C17.95 1.19 15.23 0 12 0A12 12 0 0 0 1.29 6.59l3.98 3.13C6.22 6.87 8.87 4.75 12 4.75Z"
      />
    </svg>
  );
}

/** Meta's "f" in a circle, the mark Facebook Login uses. */
function FacebookMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4.5" aria-hidden focusable="false">
      <circle cx="12" cy="12" r="12" fill="#fff" />
      <path
        fill="#1877F2"
        d="M15.67 15.47h-2.02v5.32h-2.9v-5.32H9.2v-2.42h1.55V11.5c0-2.4 1.47-3.71 3.6-3.71.87 0 1.79.15 2.01.22v2.34h-1.38c-1.08 0-1.29.51-1.29 1.26v1.44h2.58l-.6 2.42Z"
      />
    </svg>
  );
}