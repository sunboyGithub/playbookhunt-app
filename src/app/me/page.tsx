import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { MeList } from "@/components/me/me-list";
import { SettingsPanel } from "@/components/me/settings-panel";
import { SubmissionList } from "@/components/create/submission-list";
import { getViewer } from "@/lib/auth/viewer";
import { getReminderPreference, listMePlaybooks } from "@/server/queries/me";
import { nowMs } from "@/server/clock";
// A server action, called from a server component as an ordinary async function.
// It reads through the creator's own RLS-scoped client, so there is no author id
// to pass and nothing to get wrong.
import { listMyDrafts } from "@/app/actions/create-playbook";

/**
 * "My playbooks" — Frame 9.
 *
 * Private to one reader, by construction rather than by convention: the page
 * redirects without a session, and every list it shows is filtered by an id that
 * comes from the verified session and is never accepted from the URL. There is
 * no query parameter anywhere on this page that could ask for somebody else's
 * saved list.
 *
 * ## Why the tabs and filters are links
 *
 * Tabs, category chips and sort are ordinary search parameters, not client
 * state. That is a deliberate choice against a `<Tabs>` component that would be
 * less code: this is the page people come back to, and "my tried list, filtered
 * to bills, best evidence first" should survive a reload, work with the back
 * button, and be a URL they can put in a bookmark. Client state gives all three
 * away for an interaction that is a page navigation wearing a hat.
 *
 * `category` and `sort` are not reset by switching tabs, because the most common
 * reason to move between them is comparing "what I saved" with "what I reported"
 * under the same filter.
 */

export const dynamic = "force-dynamic";

const TABS = [
  { key: "saved", label: "Saved" },
  { key: "tried", label: "Tried" },
  { key: "reported", label: "Reported" },
  { key: "submissions", label: "Submissions" },
] as const;

type TabKey = (typeof TABS)[number]["key"];
type RawSearchParams = Record<string, string | string[] | undefined>;

export default async function MePage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const viewer = await getViewer();

  if (!viewer) {
    // A fixed destination rather than the current URL, so this cannot be used to
    // bounce a reader somewhere arbitrary after signing in.
    redirect("/login?next=%2Fme");
  }

  const raw = await searchParams;
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

  const tabParam = first(raw.tab);
  const settings = tabParam === "settings";
  const tab: TabKey =
    tabParam === "tried" || tabParam === "reported" || tabParam === "submissions"
      ? tabParam
      : "saved";

  const categoryParam = first(raw.category) ?? "";
  const sort = first(raw.sort) === "evidence" ? "evidence" : "recent";

  const lists = await listMePlaybooks(viewer.id);

  const href = (patch: {
    tab?: TabKey | null;
    category?: string | null;
    sort?: string | null;
  }): string => {
    const params = new URLSearchParams();

    const nextTab = patch.tab === undefined ? tab : patch.tab;
    if (nextTab !== null) params.set("tab", nextTab);

    const nextCategory = patch.category === undefined ? categoryParam : patch.category;
    if (nextCategory) params.set("category", nextCategory);

    const nextSort = patch.sort === undefined ? sort : patch.sort;
    if (nextSort !== null && nextSort !== "recent") params.set("sort", nextSort);

    const query = params.toString();
    return query ? `/me?${query}` : "/me";
  };

  // Submissions are a different shape from the other three lists — they are the
  // creator's own drafts rather than published playbooks — so they get their own
  // component and their own query rather than being bent into `MeList`.
  const submissions = tab === "submissions" ? (await listMyDrafts()).drafts : [];

  const source = tab === "submissions" ? [] : lists[tab];
  const filtered = categoryParam
    ? source.filter((item) => item.category.slug === categoryParam)
    : source;

  /**
   * "Best evidence" is most reports first, then the better rate.
   *
   * Sample size first on purpose. This is "which of my own things has the most
   * behind it", and for that question five 100% reports is a weaker answer
   * than forty at 60% — but the ordering is deliberately *not* Wilson, which is
   * what the public ranking uses. Wilson answers "how should a stranger trust
   * this"; this answers "where should I look first", and the two produce
   * different orders on the same data.
   */
  const items =
    tab === "submissions"
      ? []
      : sort === "evidence"
      ? [...filtered].sort(
          (a, b) =>
            toNumber(b.stats?.report_count)! - toNumber(a.stats?.report_count)! ||
            toNumber(b.stats?.success_rate_raw)! - toNumber(a.stats?.success_rate_raw)!,
        )
      : filtered;

  // One instant for the whole page. Reading the clock per row would let "2 days
  // ago" disagree with itself across a list, and the React Compiler rejects
  // `Date.now()` during render.
  const now = nowMs();

  const tabCounts = {
    saved: lists.saved.length,
    tried: lists.tried.length,
    reported: lists.reported.length,
    submissions: submissions.length,
  };

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">My playbooks</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Everything you&rsquo;ve saved, tried and reported. Only you can see this page.
        </p>
      </header>

      <nav className="mt-7 flex items-center gap-1 border-b border-border" aria-label="Lists">
        <div className="flex gap-1 overflow-x-auto">
          {TABS.map((entry) => (
            <Link
              key={entry.key}
              href={href({ tab: entry.key })}
              scroll={false}
              aria-current={tab === entry.key ? "page" : undefined}
              data-testid={`me-tab-${entry.key}`}
              className={`-mb-px shrink-0 border-b-2 px-3.5 py-2.5 text-sm font-medium transition-colors ${
                tab === entry.key
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {entry.label}{" "}
              <span className="text-muted-foreground">{tabCounts[entry.key]}</span>
            </Link>
          ))}
        </div>

        <Link
          href="/me?tab=settings"
          scroll={false}
          aria-current={settings ? "page" : undefined}
          data-testid="me-tab-settings"
          className={`ml-auto shrink-0 px-3.5 py-2.5 text-sm font-medium transition-colors ${
            settings ? "text-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Settings
        </Link>
      </nav>

      {settings ? (
        <Suspense fallback={null}>
          <SettingsPanel
            email={viewer.email}
            remindersEnabled={await getReminderPreference(viewer.id)}
          />
        </Suspense>
      ) : (
        <>
          {/* Chips appear only once there is something to filter to. A lone
              "All" chip is a control that cannot do anything. They are also hidden
              on Submissions, whose rows are not category-filtered and would
              ignore the filter without saying so. */}
          {tab !== "submissions" && lists.categories.length > 0 ? (
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <Chip href={href({ category: null })} active={categoryParam === ""}>
                All
              </Chip>
              {lists.categories.map((category) => (
                <Chip
                  key={category.slug}
                  href={href({ category: category.slug })}
                  active={categoryParam === category.slug}
                >
                  {category.name}
                </Chip>
              ))}

              <form method="get" className="ml-auto">
                <input type="hidden" name="tab" value={tab} />
                {categoryParam ? (
                  <input type="hidden" name="category" value={categoryParam} />
                ) : null}
                <label className="sr-only" htmlFor="me-sort">
                  Sort
                </label>
                <select
                  id="me-sort"
                  name="sort"
                  defaultValue={sort}
                  data-testid="me-sort"
                  className="h-9 rounded-lg border border-border bg-card px-2.5 text-sm"
                >
                  <option value="recent">
                    {tab === "saved" ? "Recently saved" : "Most recent"}
                  </option>
                  <option value="evidence">Best evidence</option>
                </select>
              </form>
            </div>
          ) : null}

          {tab === "submissions" ? (
            <SubmissionList drafts={submissions} />
          ) : (
            <MeList items={items} now={now} tab={tab} />
          )}
        </>
      )}
    </main>
  );
}

function toNumber(value: number | string | null | undefined): number {
  if (value === null || value === undefined || value === "") return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function Chip({ href, active, children }: { href: string; active: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={active ? "true" : undefined}
      data-testid={active ? "me-chip-on" : "me-chip-off"}
      className={`rounded-full px-3 py-1.5 text-sm transition-colors ${
        active ? "bg-foreground text-background" : "bg-muse-soft text-muse-dark hover:bg-muse-line"
      }`}
    >
      {children}
    </Link>
  );
}