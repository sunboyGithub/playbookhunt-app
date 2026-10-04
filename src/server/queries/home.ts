import "server-only";

import { createClient } from "@/lib/supabase/server";
import { listFeaturedCollections, listCategories, listUseCases } from "@/server/queries/taxonomy";
import { listPlaybooks, listProvenPlaybooks, listRecentlyVerifiedPlaybooks } from "@/server/queries/playbooks";
import type { PlaybookWithRelations, PublicReport } from "@/server/queries/types";

/**
 * Everything the homepage renders, fetched together.
 *
 * The prompt is explicit that sections sharing a data request must appear
 * together, and that per-section skeleton fallbacks defeat that. So this is one
 * function returning one object, awaited once by the page. A section that threw
 * would blank the whole page rather than leave a hole, which is the intended
 * trade: a homepage missing its "Trending" row is worse than one that took a
 * moment longer to arrive intact.
 *
 * Sections share one fetched page of playbooks rather than issuing eight
 * filtered queries, which is what lets them render together instead of each
 * arriving on its own. That shared page is `listPlaybooks`' default page of 24,
 * not the whole catalogue — so the hero counter counts separately below, and
 * anything that must see every row (the "Proven to work" row) asks for a page
 * large enough to hold it.
 */
export type HomepageData = {
  playbooks: PlaybookWithRelations[];
  proven: PlaybookWithRelations[];
  /** Whether `proven` really cleared the "Proven to work" bar, or fell back. */
  provenIsFallback: boolean;
  topThisWeek: PlaybookWithRelations[];
  categories: Awaited<ReturnType<typeof listCategories>>;
  useCases: Awaited<ReturnType<typeof listUseCases>>;
  kits: Awaited<ReturnType<typeof listFeaturedCollections>>;
  /** Agents per playbook, for the "+N" chip. Counts include the primary agent. */
  agentCounts: Record<string, number>;
  recentOutcomes: PublicReport[];
  totals: { playbooks: number; reports: number };
  /**
   * One instant for the whole page, resolved server-side.
   *
   * Every relative date on the homepage is measured against this, so "3d ago"
   * means the same moment on every card instead of drifting as each one renders.
   * It is captured here rather than in the page because `Date.now()` during
   * render is an impure read that the React Compiler rejects, and a query module
   * is not a component.
   */
  now: number;
};

export async function getHomepageData(): Promise<HomepageData> {
  const [playbooks, proven, agentCounts, categories, useCases, kits, recentOutcomes, reportTotal, playbookTotal] =
    await Promise.all([
      listPlaybooks({}, "best_evidence"),
      listProvenPlaybooks(3),
      countAgentsPerPlaybook(),
      listCategories(),
      listUseCases(),
      listFeaturedCollections(),
      listRecentApprovedOutcomes(3),
      countApprovedReports(),
      countPublishedPlaybooks(),
    ]);

  // `listProvenPlaybooks` returns only playbooks that cleared the bar, so an
  // empty result means none did. The row is then labelled "Recently verified"
  // at the call site rather than claiming evidence that does not exist.
  //
  // The trigger is an empty row, not a short one: two playbooks that genuinely
  // cleared a 20-report bar are worth more than three that did not, so a partial
  // result is shown as proven rather than discarded in favour of filler.
  const fallback = proven.length === 0;
  const provenRow = fallback ? await listRecentlyVerifiedPlaybooks(3) : proven;

  return {
    playbooks,
    proven: provenRow,
    provenIsFallback: fallback,
    // topThisWeek is the first five of the same ranked list, so it is a slice
    // rather than a second query — the ordering is identical by construction.
    topThisWeek: playbooks.slice(0, 5),
    categories,
    useCases,
    kits,
    agentCounts,
    recentOutcomes,
    // Counted, not derived from `playbooks.length` — that list is one page, so
    // using its length here would report a page size as though it were the whole
    // catalogue.
    totals: { playbooks: playbookTotal, reports: reportTotal },
    now: Date.now(),
  };
}

/**
 * Total published playbooks, for the hero counter.
 *
 * A separate count rather than `playbooks.length`, because the shared page is
 * capped and a hero that says "24 playbooks" on a catalogue of 48 is a statistic
 * that is simply wrong.
 */
async function countPublishedPlaybooks(): Promise<number> {
  const supabase = await createClient();

  const { count, error } = await supabase
    .from("playbooks")
    .select("id", { count: "exact", head: true })
    .eq("status", "published");

  if (error) {
    return 0;
  }

  return count ?? 0;
}

/**
 * How many agents each playbook links, for the "+N" chip on a card.
 *
 * One query for the whole join rather than one per playbook: the card needs a
 * count, not names, and 48 separate round trips to render a homepage would be
 * absurd for a catalogue this size.
 */
async function countAgentsPerPlaybook(): Promise<Record<string, number>> {
  const supabase = await createClient();

  const { data, error } = await supabase.from("playbook_agents").select("playbook_id");

  if (error) {
    return {};
  }

  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    counts[row.playbook_id] = (counts[row.playbook_id] ?? 0) + 1;
  }
  return counts;
}

/**
 * Recent approved outcomes for the report CTA collage.
 *
 * Reads the `public_reports` view rather than `outcome_reports` because the view
 * is already anonymous-safe: it exposes the reporter's display name and never
 * their user id, so there is nothing here to leak even if the query is wrong.
 */
async function listRecentApprovedOutcomes(limit: number): Promise<PublicReport[]> {
  const supabase = await createClient();

  // No status filter: the view already restricts itself to approved rows, and
  // exposes no `status` column to filter on.
  const { data, error } = await supabase
    .from("public_reports")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    // The collage is decoration. A failure here must not take the homepage
    // down, so it degrades to "no examples yet" rather than throwing.
    return [];
  }

  return (data ?? []) as PublicReport[];
}

/**
 * Total approved reports, for the hero counter.
 *
 * Counted from the same public view rather than from `outcome_reports`, which
 * anon cannot read a count from without also being able to read the reporters.
 */
async function countApprovedReports(): Promise<number> {
  const supabase = await createClient();

  const { count, error } = await supabase
    .from("public_reports")
    .select("id", { count: "exact", head: true });

  if (error) {
    return 0;
  }

  return count ?? 0;
}