"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Switch } from "@/components/ui/switch";
import { setReminders } from "@/app/actions/set-reminders";
import { signOut } from "@/app/actions/sign-out";

/**
 * Settings & reminders — one switch.
 *
 * The switch is optimistic because the reader has just told us what they want
 * and making them wait to see a checkbox move reads as broken. It reverts if the
 * write fails, and it says so, because a silently-reverted preference is worse
 * than a slow one: the reader leaves believing they have turned something off.
 */
export function SettingsPanel({
  email,
  remindersEnabled,
}: {
  email: string;
  remindersEnabled: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [enabled, setEnabled] = useState(remindersEnabled);
  const [lastInitial, setLastInitial] = useState(remindersEnabled);

  // Adopt a value the server changed underneath us — after a revalidate, or if
  // this panel is ever rendered from a cached shell. Adjusted during render
  // rather than in an effect, which the React Compiler rejects.
  if (remindersEnabled !== lastInitial) {
    setLastInitial(remindersEnabled);
    setEnabled(remindersEnabled);
  }

  const change = (next: boolean) => {
    const previous = enabled;
    setEnabled(next);

    startTransition(async () => {
      const outcome = await setReminders(next);
      if (!outcome.ok) {
        setEnabled(previous);
        toast.error("That didn't save. Try again in a moment.");
        return;
      }

      toast(
        next
          ? "Reminders on. One email after you try something, and nothing else."
          : "Reminders off. Nothing will be sent.",
      );
      router.refresh();
    });
  };

  return (
    <div className="mt-6 max-w-xl" data-testid="me-settings">
      <section className="rounded-2xl border border-border bg-card p-6">
        <h2 className="text-base font-semibold">Reminders</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Signed in as <span className="text-foreground">{email}</span>.
        </p>

        <label className="mt-5 flex items-start justify-between gap-6">
          <span>
            <span className="block text-sm font-medium">Email me a reminder to report</span>
            <span className="mt-1 block text-sm text-muted-foreground">
              One email, once, after you try a playbook &mdash; linking straight back to the
              form. Turning this off stops all of it, immediately, including anything already
              queued.
            </span>
          </span>

          <Switch
            checked={enabled}
            onCheckedChange={change}
            disabled={pending}
            aria-label="Email me a reminder to report"
            data-testid="me-reminders-switch"
          />
        </label>

        {pending ? (
          <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" aria-hidden /> Saving…
          </p>
        ) : null}
      </section>

      <section className="mt-4 rounded-2xl border border-border bg-card p-6">
        <h2 className="text-base font-semibold">What we don&rsquo;t send anywhere</h2>
        <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
          <li>
            The values you type into a playbook&rsquo;s inputs stay in your browser. Filling in
            a negotiation prompt never sends those numbers to us.
          </li>
          <li>Your report is public as a number and a result. The name on it is your first initial.</li>
          <li>Evidence screenshots are private to you and our reviewers, and are never shown on a page.</li>
        </ul>
      </section>

      <div className="mt-4">
        <form action={signOut}>
          <button
            type="submit"
            className="text-sm text-muted-foreground underline hover:text-foreground"
          >
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}