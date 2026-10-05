"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  reorderCollectionItems,
  reorderUseCaseItems,
  saveCollection,
  saveUseCase,
  setArrangedItem,
} from "@/server/admin/actions/arranged";

/**
 * Starter kits and Popular Use Cases: the two hand-arranged lists.
 *
 * Both are a parent row plus an ordered list of playbooks, and both are edited
 * here. The reason they share a file is that they share every decision — the
 * order is written as a whole list, adding goes to the end, the same two actions
 * guard both — and the only things that actually differ are a use case's
 * gradient and a kit's featured flag.
 *
 * ## Why the order is not drag-and-drop
 *
 * Reordering writes the entire list every time, and the server refuses a list
 * that is not a permutation of the stored one rather than repairing it — see
 * `normalizeOrder`. Two up/down buttons cannot express "drop this somewhere
 * between two things", so there is no way for the browser to send an order the
 * server will refuse, and there is no drag state to get out of sync with the
 * database when two people have the page open. The list is short and the order
 * is the content; up and down is enough.
 *
 * ## Why the whole list is written at once
 *
 * Two rows briefly sharing a `sort` value is the failure mode of a partial move,
 * and it shows up as a public page listing the same playbook twice or skipping
 * one. Rewriting every row is idempotent, cannot half-apply, and needs no
 * transaction — which PostgREST would not give us anyway.
 *
 * ## Why the picker lists drafts
 *
 * Arranging a kit is when the catalogue is still in flux, and hiding the drafts
 * would make the playbook somebody had in mind simply absent with no way to tell
 * that from "it does not exist". A draft in a kit is not a public claim — the
 * public pages filter to published — and the row shows which state it is in.
 */

type Table = "collection" | "use_case";

export type ArrangedFields = {
  title: string;
  slug: string;
  blurb: string;
  illustrationUrl: string;
  gradientFrom: string;
  gradientTo: string;
  isFeatured: boolean;
  sort: number;
};

export type ArrangedItemRow = { playbookId: string; slug: string; title: string; status: string };
export type PlaybookOption = { id: string; slug: string; title: string; status: string };

const EMPTY: ArrangedFields = {
  title: "",
  slug: "",
  blurb: "",
  illustrationUrl: "",
  gradientFrom: "#E8EFFC",
  gradientTo: "#DCE7F5",
  isFeatured: false,
  sort: 0,
};

/** Typing a slug by hand is the only way to get one that does not match the title. */
function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function ArrangedEditor({
  table,
  id,
  fields,
  items,
  options,
}: {
  table: Table;
  /** `null` for a new one. */
  id: string | null;
  fields: ArrangedFields | null;
  items: ArrangedItemRow[];
  options: PlaybookOption[];
}) {
  const router = useRouter();
  const isCollection = table === "collection";
  const [values, setValues] = useState<ArrangedFields>(fields ?? EMPTY);
  const [pending, startTransition] = useTransition();
  // The order as edited but not yet saved. Held separately from `items` so a
  // save that is still in flight cannot re-render the list mid-edit.
  const [order, setOrder] = useState<string[]>(items.map((item) => item.playbookId));
  const [slugTouched, setSlugTouched] = useState(Boolean(fields?.slug));

  const set = <K extends keyof ArrangedFields>(key: K, value: ArrangedFields[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
  };

  const save = () => {
    startTransition(async () => {
      const result = isCollection
        ? await saveCollection({
            id,
            fields: {
              title: values.title,
              slug: values.slug,
              blurb: values.blurb,
              illustrationUrl: values.illustrationUrl,
              isFeatured: values.isFeatured,
              sort: values.sort,
            },
          })
        : await saveUseCase({
            id,
            fields: {
              title: values.title,
              slug: values.slug,
              description: values.blurb,
              gradientFrom: values.gradientFrom,
              gradientTo: values.gradientTo,
              sort: values.sort,
            },
          });

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      toast.success("Saved.");
      if (!id) {
        // A new row has no id to refresh into, and staying here would leave a form
        // whose save just created a duplicate. Go back to the list.
        router.push(isCollection ? "/admin/collections" : "/admin/use-cases");
        return;
      }
      router.refresh();
    });
  };

  const move = (index: number, delta: number) => {
    setOrder((current) => {
      const to = index + delta;
      if (to < 0 || to >= current.length) return current;
      const next = [...current];
      [next[index], next[to]] = [next[to], next[index]];
      return next;
    });
  };

  const saveOrder = () => {
    startTransition(async () => {
      const result = isCollection
        ? await reorderCollectionItems({ collectionId: id!, order })
        : await reorderUseCaseItems({ useCaseId: id!, order });

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      toast.success("Order saved.");
      router.refresh();
    });
  };

  const toggleItem = (playbookId: string, present: boolean) => {
    startTransition(async () => {
      const result = await setArrangedItem({
        table,
        parentId: id!,
        playbookId,
        present,
      });

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      // New items land at the end of the stored order, which is exactly what the
      // stored order is here — this list is the source of truth until the page
      // refreshes.
      setOrder((current) =>
        present ? [...current, playbookId] : current.filter((row) => row !== playbookId),
      );
      toast.success(present ? "Added to the end." : "Removed.");
    });
  };

  const present = new Set(order);
  const byId = new Map(options.map((option) => [option.id, option]));
  const label = isCollection ? "starter kit" : "use case";

  return (
    <div className="space-y-6">
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <div>
          <label htmlFor="arranged-title" className="text-sm font-medium">
            Title
          </label>
          <Input
            id="arranged-title"
            className="mt-1"
            value={values.title}
            maxLength={120}
            onChange={(event) => {
              const title = event.target.value;
              setValues((current) => ({
                ...current,
                title,
                // Only while the slug is untouched: the moment somebody edits it
                // by hand it is theirs, not ours.
                slug: slugTouched ? current.slug : slugify(title),
              }));
            }}
          />
        </div>

        <div>
          <label htmlFor="arranged-slug" className="text-sm font-medium">
            Address
          </label>
          <p className="text-xs text-muted-foreground">
            {isCollection ? "/kits/" : "/use-cases/"}
            {values.slug || "…"}
          </p>
          <Input
            id="arranged-slug"
            className="mt-1 font-mono"
            value={values.slug}
            onChange={(event) => {
              setSlugTouched(true);
              set("slug", event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
            }}
          />
        </div>

        <div>
          <label htmlFor="arranged-blurb" className="text-sm font-medium">
            {isCollection ? "What is in it" : "Description"}
          </label>
          <Textarea
            id="arranged-blurb"
            className="mt-1 min-h-20"
            value={values.blurb}
            maxLength={400}
            onChange={(event) => set("blurb", event.target.value)}
          />
        </div>

        {isCollection ? (
          <div>
            <label htmlFor="arranged-illustration" className="text-sm font-medium">
              Illustration URL
            </label>
            <Input
              id="arranged-illustration"
              className="mt-1"
              type="url"
              placeholder="https://…"
              value={values.illustrationUrl}
              maxLength={500}
              onChange={(event) => set("illustrationUrl", event.target.value)}
            />
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {(["gradientFrom", "gradientTo"] as const).map((key) => (
              <div key={key}>
                <label htmlFor={`arranged-${key}`} className="text-sm font-medium">
                  {key === "gradientFrom" ? "Gradient from" : "Gradient to"}
                </label>
                <Input
                  id={`arranged-${key}`}
                  className="mt-1 font-mono"
                  value={values[key]}
                  onChange={(event) => set(key, event.target.value)}
                />
                <span
                  aria-hidden
                  className="mt-1 block h-4 rounded"
                  style={{
                    background: `linear-gradient(to right, ${values.gradientFrom}, ${values.gradientTo})`,
                  }}
                />
              </div>
            ))}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="arranged-sort" className="text-sm font-medium">
              Order on the listing
            </label>
            <p className="text-xs text-muted-foreground">Lower comes first. Ties keep this order.</p>
            <Input
              id="arranged-sort"
              className="mt-1"
              type="number"
              value={values.sort}
              onChange={(event) => set("sort", Number(event.target.value) || 0)}
            />
          </div>

          {isCollection ? (
            <label className="flex items-start gap-2 pt-6 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 size-4 rounded border-border"
                checked={values.isFeatured}
                onChange={(event) => set("isFeatured", event.target.checked)}
              />
              <span>
                Feature this kit
                <span className="block text-xs text-muted-foreground">
                  Featured kits get the slot on the home page. It is a placement, never a ranking
                  factor.
                </span>
              </span>
            </label>
          ) : null}
        </div>

        <Button type="submit" disabled={pending} data-testid="arranged-save">
          {id ? "Save" : `Create this ${label}`}
        </Button>
      </form>

      {id ? (
        <section className="rounded-2xl border border-border p-5" data-testid="arranged-items">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold">
              Playbooks in this {label} ({order.length})
            </h3>
            <Button size="sm" variant="outline" onClick={saveOrder} disabled={pending}>
              Save order
            </Button>
          </div>

          <p className="mt-0.5 text-xs text-muted-foreground">
            The order is the content — a kit that starts with the first thing you do is a different
            kit from the same one alphabetically.
          </p>

          {order.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Empty. Add some from the list below; they go on the end until you move them.
            </p>
          ) : (
            <ol className="mt-3 space-y-2">
              {order.map((playbookId, index) => {
                const item = byId.get(playbookId);

                return (
                  <li key={playbookId} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
                    <span className="w-5 shrink-0 text-xs tabular-nums text-muted-foreground">
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {item?.title ?? "A playbook that is no longer listed"}
                      {item && item.status !== "published" ? (
                        <span className="ml-1.5 text-xs text-muted-foreground">
                          ({item.status} — invisible to readers)
                        </span>
                      ) : null}
                    </span>
                    <Button
                      size="icon"
                      variant="ghost"
                      type="button"
                      aria-label="Move up"
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                    >
                      <ArrowUp className="size-4" aria-hidden />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      type="button"
                      aria-label="Move down"
                      disabled={index === order.length - 1}
                      onClick={() => move(index, 1)}
                    >
                      <ArrowDown className="size-4" aria-hidden />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      type="button"
                      aria-label="Remove from this list"
                      disabled={pending}
                      onClick={() => toggleItem(playbookId, false)}
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </Button>
                  </li>
                );
              })}
            </ol>
          )}

          <details className="mt-4" open>
            <summary className="cursor-pointer text-sm font-medium">
              Add a playbook ({options.length - order.length} not in this list)
            </summary>
            <ul className="mt-2 max-h-72 space-y-1 overflow-y-auto">
              {options
                .filter((option) => !present.has(option.id))
                .map((option) => (
                  <li key={option.id}>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => toggleItem(option.id, true)}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm transition-colors hover:bg-muted"
                    >
                      <Plus className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="min-w-0 flex-1 truncate">{option.title}</span>
                      {option.status !== "published" ? (
                        <span className="text-xs text-muted-foreground">{option.status}</span>
                      ) : null}
                    </button>
                  </li>
                ))}
            </ul>
          </details>
        </section>
      ) : null}
    </div>
  );
}