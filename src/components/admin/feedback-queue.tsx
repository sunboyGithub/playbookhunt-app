"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { AdminEmpty } from "@/components/admin/shell";
import { setFeedbackStatus } from "@/server/admin/actions/feedback";
import type { FeedbackItem, FeedbackStatus } from "@/server/admin/queries/feedback";

/**
 * Tester feedback.
 *
 * ## Why this can do almost nothing
 *
 * Two buttons. Feedback is where people say what is broken, and it is read by
 * whoever maintains the site — not filed, not triaged into queues, not escalated.
 * The interesting action is the one that is not here: fixing the thing.
 *
 * ## Why nothing on this page touches ranking
 *
 * A feedback message is somebody's opinion, and the site's whole claim is that
 * its numbers are reports rather than opinions. Nothing in `src/lib/ranking/`
 * reads this table, and no action writes to `playbook_stats`. Marking a message
 * reviewed changes exactly one boolean and re-renders this list.
 *
 * ## Why the address is shown raw
 *
 * It is optional and the person chose to leave it, and this page is admin-only.
 * A "reply" action is deliberately absent: it would need a mail path this build
 * does not have, and a half-built reply button is worse than none.
 */

const STATES: { value: FeedbackStatus; label: string }[] = [
  { value: "reviewed", label: "Read" },
  { value: "closed", label: "Closed" },
  { value: "new", label: "Unread" },
];

export function FeedbackQueue({ items }: { items: FeedbackItem[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState<string | null>(null);

  const decide = (feedbackId: string, status: FeedbackStatus) => {
    startTransition(async () => {
      const result = await setFeedbackStatus({ feedbackId, status });

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      toast.success(`Marked ${status}.`);
      router.refresh();
    });
  };

  if (items.length === 0) {
    return (
      <AdminEmpty>
        Nothing here. Feedback people send from a page turns up in this list — and stays here,
        unread by everyone else.
      </AdminEmpty>
    );
  }

  return (
    <ul className="divide-y divide-border" data-testid="feedback-queue">
      {items.map((item) => {
        const open = expanded === item.id;
        const preview = item.message.length > 220 ? `${item.message.slice(0, 220)}…` : item.message;

        return (
          <li key={item.id} className="px-5 py-4" data-testid="feedback-row" data-status={item.status}>
            <div className="flex flex-wrap items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm whitespace-pre-wrap">
                  {open ? item.message : preview}
                </p>

                <p className="mt-1 text-xs text-muted-foreground">
                  {new Date(item.createdAt).toLocaleString()}
                  {item.pathname ? (
                    <>
                      {" · on "}
                      <code className="font-mono">{item.pathname}</code>
                    </>
                  ) : null}
                  {item.email ? <> · {item.email}</> : " · no address"}
                </p>

                {item.message.length > 220 ? (
                  <button
                    type="button"
                    onClick={() => setExpanded(open ? null : item.id)}
                    className="mt-1 text-xs text-muted-foreground underline"
                  >
                    {open ? "Show less" : "Read the rest"}
                  </button>
                ) : null}
              </div>

              <div className="flex shrink-0 flex-wrap gap-1.5">
                {STATES.filter((state) => state.value !== item.status).map((state) => (
                  <Button
                    key={state.value}
                    size="sm"
                    variant={state.value === "closed" ? "ghost" : "outline"}
                    disabled={pending}
                    onClick={() => decide(item.id, state.value)}
                    data-testid={`feedback-${state.value}`}
                  >
                    {state.label}
                  </Button>
                ))}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}