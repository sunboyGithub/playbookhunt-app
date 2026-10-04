import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PlaybookCard } from "@/components/playbook-card";
import { nowMs } from "@/server/clock";
import { listPlaybooks } from "@/server/queries/playbooks";
import { getCollection } from "@/server/queries/taxonomy";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const kit = await getCollection(slug);

  if (!kit) {
    return { title: "Starter kit not found" };
  }

  return { title: `${kit.title} — starter kit`, description: kit.blurb };
}

/**
 * A starter kit: its playbooks in author order.
 *
 * Row density rather than the results grid, because a kit *is* an ordered list —
 * "do this, then this" is the content. And no filters, sort or pagination: the
 * brief gives a kit exactly one shape, and offering to reorder it would imply
 * the order is optional.
 *
 * `now` is read here rather than in the card, for the same reason as everywhere
 * else: one timestamp per page, and never during render of a component.
 */
export default async function KitPage({ params: routeParams }: Props) {
  const { slug } = await routeParams;
  const kit = await getCollection(slug);

  if (!kit) {
    notFound();
  }

  // Fetched in kit order rather than sorted by evidence: the author decided the
  // sequence, and re-sorting it would break the one thing the page is for.
  const playbooks = await listPlaybooks({
    collectionSlug: slug,
    limit: kit.playbook_ids.length > 0 ? kit.playbook_ids.length : 1,
  }, "best_evidence");

  const byId = new Map(playbooks.map((playbook) => [playbook.id, playbook]));
  const ordered = kit.playbook_ids
    .map((id) => byId.get(id))
    .filter((playbook) => playbook !== undefined);

  const now = nowMs();

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <div className="flex gap-6">
        <div
          className="hidden w-24 shrink-0 overflow-hidden rounded-xl border border-border bg-tint-mint sm:block"
          aria-hidden
        >
          {kit.illustration_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={kit.illustration_url} alt="" className="size-full object-cover" />
          ) : null}
        </div>

        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{kit.title}</h1>
          <p className="mt-1 text-muted-foreground">{kit.blurb}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            {ordered.length} {ordered.length === 1 ? "playbook" : "playbooks"}
          </p>
        </div>
      </div>

      {ordered.length === 0 ? (
        <p className="py-12 text-muted-foreground">
          This kit does not have any playbooks yet.
        </p>
      ) : (
        <ol className="mt-8 divide-y divide-border rounded-xl border border-border bg-card">
          {ordered.map((playbook, index) => (
            <li key={playbook.id}>
              <PlaybookCard
                playbook={playbook}
                density="row"
                rank={index + 1}
                now={now}
              />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}