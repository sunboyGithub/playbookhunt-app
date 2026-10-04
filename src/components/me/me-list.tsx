"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, Star } from "lucide-react";
import { toast } from "sonner";

import { MeCard } from "@/components/me/me-card";
import { Button } from "@/components/ui/button";
import { toggleSave } from "@/app/actions/toggle-save";
import { deleteReport } from "@/app/actions/edit-report";
import type { MePlaybook } from "@/server/queries/me";

/**
 * The list itself, with the two things on it that need JavaScript.
 *
 * Everything else — the tabs, the category chips, the sort — is real links to
 * search params, so the page works without scripting, survives a reload, and
 * can be linked to. That matters more here than usual: this is the page people
 * come back to, and "my tried list, filtered to bills, sorted by evidence" is a
 * URL somebody wants to bookmark.
 *
 * `now` arrives as a prop rather than being read from the clock, so the "saved
 * 2 days ago" text is computed once on the server and cannot disagree with
 * itself between the list and the header.
 */
export function MeList({
  items,
  now,
  tab,
}: {
  items: MePlaybook[];
  now: number;
  tab: "saved" | "tried" | "reported";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  const unsave = (item: MePlaybook) => {
    setBusyId(item.id);
    startTransition(async () => {
      const outcome = await toggleSave({ playbookId: item.id, saved: true });
      if (!outcome.ok) {
        toast.error("That didn't save. Try again in a moment.");
      } else {
        toast("Removed from saved.");
      }
      setBusyId(null);
      // The list is the server's view of the reader's data, so it is refetched
      // rather than patched here — the same reason every other list on this site
      // re-renders from the server.
      router.refresh();
    });
  };

  const remove = (item: MePlaybook) => {
    if (!item.reportId) return;

    // A confirm, not a second click on the same button. Deleting is the only
    // action on this page the reader cannot take back, so it gets a question,
    // and the question says what actually happens: the number leaves the counts.
    const confirmed = window.confirm(
      "Delete this report? It will be taken out of the numbers on this playbook. This can't be undone.",
    );
    if (!confirmed) return;

    setBusyId(item.id);
    startTransition(async () => {
      const outcome = await deleteReport({ reportId: item.reportId as string });
      if (!outcome.ok) {
        toast.error(outcome.error ?? "That didn't delete. Try again in a moment.");
      } else {
        toast("Report deleted.");
      }
      setBusyId(null);
      router.refresh();
    });
  };

  if (items.length === 0) {
    return <EmptyState tab={tab} />;
  }

  return (
    <ul className="mt-6 grid gap-4 sm:grid-cols-2" data-testid="me-list">
      {items.map((item) => (
        <li key={item.id} className="contents">
          <MeCard
            item={item}
            now={now}
            tab={tab}
            onUnsave={tab === "saved" ? () => unsave(item) : undefined}
            unsaving={tab === "saved" && busyId === item.id && pending}
          />

          {tab === "reported" && item.reportId ? (
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card px-5 py-4 sm:col-span-2">
              <p className="text-sm text-muted-foreground">
                {item.reportEditable
                  ? "You can change what you said for the next 24 hours."
                  : "Reports lock after 24 hours. You can still delete this one."}
              </p>

              {item.reportEditable ? (
                <Button asChild size="sm" variant="outline" className="rounded-full">
                  <a href={`/p/${item.slug}/report?edit=1`} data-testid="me-edit-report">
                    Edit report
                  </a>
                </Button>
              ) : null}

              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={busyId === item.id && pending}
                onClick={() => remove(item)}
                className="rounded-full text-destructive hover:bg-destructive/10"
                data-testid="me-delete-report"
              >
                {busyId === item.id && pending ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : null}
                Delete report
              </Button>
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

const EMPTY: Record<string, { title: string; body: string }> = {
  saved: {
    title: "No saved playbooks yet",
    body: "Tap ☆ Save on any playbook to keep it here.",
  },
  tried: {
    title: "Nothing tried yet",
    body: "Open a playbook and hit Try — it'll show up here so you can come back and say how it went.",
  },
  reported: {
    title: "No reports yet",
    body: "Once you report how something went, it turns into a public number. You'll see it here.",
  },
};

/**
 * Empty states that say what to do next.
 *
 * Each one names the action that fills it, in the reader's words rather than the
 * site's. A blank tab with "No items" is a dead end; "Tap ☆ Save on any playbook"
 * is the same fact with a door in it.
 */
function EmptyState({ tab }: { tab: "saved" | "tried" | "reported" }) {
  const copy = EMPTY[tab] ?? EMPTY.saved;

  return (
    <div
      className="mt-6 rounded-2xl border border-dashed border-border p-10 text-center"
      data-testid="me-empty"
    >
      <span className="mx-auto flex size-11 items-center justify-center rounded-full bg-muse-soft">
        <Star className="size-5 text-muse" aria-hidden />
      </span>

      <h2 className="mt-4 text-lg font-semibold">{copy.title}</h2>
      <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted-foreground">{copy.body}</p>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <a
          href="/playbooks?sort=best_evidence"
          className="inline-flex h-11 items-center rounded-full bg-foreground px-6 text-background"
          data-testid="me-empty-cta"
        >
          Browse Proven to work
        </a>
        {tab !== "saved" ? (
          <a href="/me?tab=saved" className="text-sm underline">
            Your saved list
          </a>
        ) : null}
      </div>
    </div>
  );
}