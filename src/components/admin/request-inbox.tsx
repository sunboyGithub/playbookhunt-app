"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { AdminEmpty } from "@/components/admin/shell";
import { setRequestStatus, type RequestStatus } from "@/server/admin/actions/requests";
import type { RequestGroup } from "@/server/admin/queries/requests";

/**
 * The requests inbox.
 *
 * ## What a group means
 *
 * Each line is one *request*, not one person. Nine people typing "cancel my
 * subscription" are one thing to build and nine data points about demand, so the
 * copies collapse into the earliest one — the one the founder saw first — and the
 * rest are folded in.
 *
 * Deciding a group decides all its copies at once, which is the useful default:
 * "we built it" is true of every person who asked. And it is reversible — putting
 * a group back to new puts every copy back.
 *
 * ## Why marking something planned does not tell anybody
 *
 * There is no email here. A request is anonymous unless the person left an
 * address, and the point of the inbox is to decide what to build next, not to run
 * a waiting list. Building the playbook and publishing it is how those people
 * find out.
 */

const STATES: { value: RequestStatus; label: string; hint: string }[] = [
  { value: "planned", label: "Plan to build", hint: "We intend to." },
  { value: "done", label: "Built", hint: "There is a playbook for it now." },
  { value: "new", label: "Not yet", hint: "Back to unread." },
];

export function RequestInbox({ groups }: { groups: RequestGroup[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState<string | null>(null);

  const decide = (ids: string[], status: RequestStatus) => {
    startTransition(async () => {
      const result = await setRequestStatus({ requestIds: ids, status });

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      toast.success(`${result.applied} request${result.applied === 1 ? "" : "s"} — ${status}.`);
      router.refresh();
    });
  };

  if (groups.length === 0) {
    return (
      <AdminEmpty>
        Nobody has asked for a playbook that does not exist. When they do, it turns up here
        without anyone having to go and ask.
      </AdminEmpty>
    );
  }

  return (
    <ul className="divide-y divide-border" data-testid="request-inbox">
      {groups.map((group) => {
        // Every copy in the group, so "mark this built" really does apply to all
        // fourteen people who asked rather than to the one line on screen.
        const ids = [group.id, ...group.others.map((row) => row.id)];
        const open = expanded === group.id;

        return (
          <li key={group.id} className="px-5 py-4" data-testid="request-row" data-status={group.status}>
            <div className="flex flex-wrap items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{group.query}</p>

                <p className="mt-1 text-xs text-muted-foreground">
                  {group.count === 1 ? "Asked once" : `Asked ${group.count} times`} ·{" "}
                  {new Date(group.createdAt).toLocaleDateString()}
                  {group.count > 1 ? " · first asked" : ""}
                  {group.topic ? ` · ${group.topic}` : ""}
                </p>

                {group.purpose ? (
                  <p className="mt-1 text-sm text-muted-foreground">
                    <span className="font-medium">For:</span> {group.purpose}
                  </p>
                ) : null}

                {group.pathname ? (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Sent from <code className="font-mono">{group.pathname}</code>
                  </p>
                ) : null}

                {group.count > 1 ? (
                  <button
                    type="button"
                    onClick={() => setExpanded(open ? null : group.id)}
                    className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground underline"
                    aria-expanded={open}
                  >
                    <ChevronDown
                      className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`}
                      aria-hidden
                    />
                    {open ? "Hide" : "Show"} the other {group.count - 1}
                  </button>
                ) : null}

                {open ? (
                  <ol className="mt-2 space-y-1 border-l-2 border-border pl-3 text-xs">
                    {group.others.map((row) => (
                      <li key={row.id} className="text-muted-foreground">
                        <span className="font-medium text-foreground">{row.query}</span> ·{" "}
                        {new Date(row.createdAt).toLocaleDateString()}
                        {row.purpose ? ` · ${row.purpose}` : ""}
                      </li>
                    ))}
                  </ol>
                ) : null}

                {group.status !== "new" ? (
                  <p className="mt-2 inline-block rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    {group.status}
                    {group.decidedAt ? ` · ${new Date(group.decidedAt).toLocaleDateString()}` : ""}
                  </p>
                ) : null}
              </div>

              <div className="flex shrink-0 flex-wrap gap-1.5">
                {STATES.filter((state) => state.value !== group.status).map((state) => (
                  <Button
                    key={state.value}
                    size="sm"
                    variant={state.value === "new" ? "ghost" : "outline"}
                    disabled={pending}
                    title={state.hint}
                    onClick={() => decide(ids, state.value)}
                    data-testid={`request-${state.value}`}
                  >
                    {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                    {state.label}
                    {group.count > 1 ? ` (${group.count})` : ""}
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