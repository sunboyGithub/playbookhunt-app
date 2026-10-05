"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { updatePlaybookCore } from "@/server/admin/actions/playbooks";

/**
 * The core fields of a playbook, editable in place.
 *
 * ## Why the status is a field and not a button
 *
 * There is no separate "Publish" button next to "Save". Two buttons that look
 * equally safe, one of which puts a page on the internet, is how a draft gets
 * published by somebody who meant to fix a typo. With a status field, publishing
 * is a thing you have to scroll to and choose.
 *
 * The cost is that a moderator editing a promise has to notice the field says
 * "published" and not change it, which is a smaller mistake to make and a smaller
 * mistake to undo — the audit log records the status either way.
 *
 * ## Why the slug is not editable here
 *
 * The slug is the public address. Changing it breaks every link anybody has
 * shared and every report that cites it, and nothing here would remember to
 * redirect them. It is fixed at creation, on purpose.
 *
 * ## Why everything is controlled state
 *
 * The action takes an object rather than a `FormData`, so the fields are read from
 * state and passed straight through. There is no serialization step, which means
 * there is no second place where the schema and the form can disagree about what
 * a field is called.
 */

export type CoreFieldsValues = {
  id: string;
  title: string;
  promise: string;
  whoFor: string;
  whoNotFor: string;
  status: string;
  previewImageUrl: string;
};

const STATUSES = [
  { value: "draft", label: "Draft — not on the site" },
  { value: "published", label: "Published — visible in search and listings" },
  { value: "archived", label: "Archived — hidden, keeps its reports" },
];

export function CoreFieldsForm({ values }: { values: CoreFieldsValues }) {
  const router = useRouter();
  const [fields, setFields] = useState(values);
  const [pending, startTransition] = useTransition();

  const set = <K extends keyof CoreFieldsValues>(key: K, value: CoreFieldsValues[K]) => {
    setFields((current) => ({ ...current, [key]: value }));
  };

  const save = () => {
    startTransition(async () => {
      const result = await updatePlaybookCore(fields);

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      for (const warning of result.warnings ?? []) {
        toast.warning(warning);
      }

      toast.success("Saved.");
      router.refresh();
    });
  };

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <div>
        <label htmlFor="core-title" className="text-sm font-medium">
          Title
        </label>
        <Input
          id="core-title"
          className="mt-1"
          value={fields.title}
          maxLength={120}
          onChange={(event) => set("title", event.target.value)}
        />
      </div>

      <div>
        <label htmlFor="core-promise" className="text-sm font-medium">
          Promise
        </label>
        <p className="text-xs text-muted-foreground">
          One sentence, in the second person, saying what the reader gets. This is the line under
          the title on the public page.
        </p>
        <Textarea
          id="core-promise"
          className="mt-1 min-h-20"
          value={fields.promise}
          maxLength={300}
          onChange={(event) => set("promise", event.target.value)}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="core-who-for" className="text-sm font-medium">
            Who it is for
          </label>
          <Textarea
            id="core-who-for"
            className="mt-1 min-h-20"
            value={fields.whoFor}
            maxLength={500}
            onChange={(event) => set("whoFor", event.target.value)}
          />
        </div>

        <div>
          <label htmlFor="core-who-not-for" className="text-sm font-medium">
            Who it is not for
          </label>
          <p className="text-xs text-muted-foreground">
            Written as often as the first list. It is the part that keeps a reader from filing a
            report about a playbook that was never going to fit them.
          </p>
          <Textarea
            id="core-who-not-for"
            className="mt-1 min-h-20"
            value={fields.whoNotFor}
            maxLength={500}
            onChange={(event) => set("whoNotFor", event.target.value)}
          />
        </div>
      </div>

      <div>
        <label htmlFor="core-preview" className="text-sm font-medium">
          Preview image URL
        </label>
        <Input
          id="core-preview"
          className="mt-1"
          type="url"
          placeholder="https://…"
          value={fields.previewImageUrl}
          maxLength={500}
          onChange={(event) => set("previewImageUrl", event.target.value)}
        />
      </div>

      <div>
        <label htmlFor="core-status" className="text-sm font-medium">
          Status
        </label>
        <select
          id="core-status"
          className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm"
          value={fields.status}
          onChange={(event) => set("status", event.target.value)}
          data-testid="core-status"
        >
          {STATUSES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {fields.status === "published" ? (
          <p className="mt-1 text-xs text-muted-foreground">
            Saving will put this page in search and in the listings, and the header and footer stop
            saying it is a draft.
          </p>
        ) : null}
      </div>

      <Button type="submit" disabled={pending} data-testid="core-save">
        Save these fields
      </Button>
    </form>
  );
}