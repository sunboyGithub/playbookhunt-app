import type { Metadata } from "next";
import Link from "next/link";

import { listCollections } from "@/server/queries/taxonomy";

export const metadata: Metadata = {
  title: "Starter kits",
  description: "Curated bundles of AI playbooks for a task, in the order to run them.",
};

/**
 * Every starter kit.
 *
 * Counts come from the membership the importer links, so a kit showing zero is
 * a real signal — a kit with no playbooks in it is a content bug, and this page
 * is where it becomes visible rather than a kit card leading somewhere empty.
 */
export default async function KitsPage() {
  const kits = await listCollections();

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Starter kits</h1>
      <p className="mt-1 text-muted-foreground">
        Playbooks that belong together, in the order to run them.
      </p>

      <ul className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {kits.map((kit) => (
          <li key={kit.id}>
            <Link
              href={`/k/${kit.slug}`}
              className="flex overflow-hidden rounded-xl border border-border bg-card transition-colors hover:bg-accent"
            >
              {/* The illustration slot. The homepage renders the same shape so a
                  kit looks the same wherever it is linked from; the real
                  illustration, when one exists, replaces this in both. */}
              <div className="w-1/3 shrink-0 border-r border-border bg-tint-mint" aria-hidden>
                {kit.illustration_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={kit.illustration_url}
                    alt=""
                    className="size-full object-cover"
                    loading="lazy"
                  />
                ) : null}
              </div>
              <div className="flex flex-1 flex-col gap-2 p-5">
                <span className="font-semibold">{kit.title}</span>
                <span className="text-sm text-muted-foreground">{kit.blurb}</span>
                <span className="mt-auto text-sm text-muted-foreground">
                  {kit.playbook_ids.length}{" "}
                  {kit.playbook_ids.length === 1 ? "playbook" : "playbooks"}
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}