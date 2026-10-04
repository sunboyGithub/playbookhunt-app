import {
  DEFAULT_SORT,
  isSortOption,
  type ListPlaybooksFilters,
  type SortOption,
} from "@/server/queries/types";

/**
 * Every filter, sort and view mode, as the URL expresses them.
 *
 * The URL is the source of truth, which means it has to be parseable by someone
 * who has never seen this app: a shared link must reproduce the same results on
 * a phone as on a laptop. So every field has one canonical spelling and one
 * place that decides what a nonsense value means.
 *
 * That last part is the one worth stating. A URL is user input — anyone can
 * edit it, paste it, or get it from a crawler. Unknown values fall back to
 * "no filter" rather than throwing, because a stale link with a filter this
 * version no longer has should show the unfiltered list, not a 500.
 *
 * Nothing here imports `server-only`, so the filter controls and the page that
 * renders their results parse the same code and cannot disagree about what
 * `?outcome=plan` means.
 */

export const OUTCOME_PILLS = [
  { value: "save_money", label: "Save money" },
  { value: "save_time", label: "Save time" },
  { value: "plan", label: "Plan" },
  { value: "research", label: "Research" },
  { value: "create", label: "Create" },
] as const;

export type OutcomePill = (typeof OUTCOME_PILLS)[number]["value"];
export const OUTCOME_PILL_VALUES: readonly string[] = OUTCOME_PILLS.map((p) => p.value);

/**
 * What each outcome pill filters on.
 *
 * Save money and Save time map straight onto `outcome_type`. The other three do
 * not, and this is the honest reason why: the schema records *how much* a
 * playbook saves (money, time, or a yes/no outcome) and nothing about *what
 * kind of task* it is. So Plan, Research and Create are derived from category,
 * which is a real signal about the task, and the mapping is narrow and stated
 * here rather than hidden in a query.
 *
 * The consequence to be aware of: these three pills are a v1 approximation. A
 * "Plan" result is a travel-planning or productivity playbook, not a playbook
 * whose schema says it plans. When `outcome_type` grows a task dimension this
 * mapping should be replaced, and until then it is the best available honest
 * approximation rather than a fabricated signal.
 */
const PILL_FILTERS: Record<OutcomePill, Partial<ListPlaybooksFilters>> = {
  save_money: { outcomeGroup: "save_money" },
  save_time: { outcomeGroup: "save_time" },
  plan: { categorySlugs: ["travel-planning", "productivity"] },
  research: { categorySlugs: ["health"] },
  create: { categorySlugs: ["creativity"] },
};

/** The report-count filter's three offered steps. */
export const MIN_REPORT_OPTIONS = [0, 20, 100] as const;

/** Time-to-complete bands. Both bounds are inclusive, on `time_min`. */
export const TIME_BANDS = {
  under15: { label: "Under 15 min", min: undefined, max: 14 },
  from15to60: { label: "15–60 min", min: 15, max: 60 },
  over60: { label: "60+ min", min: 61, max: undefined },
} as const;

export type TimeBand = keyof typeof TIME_BANDS;
export const TIME_BAND_VALUES: readonly string[] = Object.keys(TIME_BANDS);

export type ViewMode = "cards" | "list";
export const VIEW_MODES: readonly string[] = ["cards", "list"];

export type ResultsParams = {
  q: string;
  category?: string;
  agent?: string;
  outcome?: OutcomePill;
  /** Verified within this many days. */
  verified?: number;
  minReports?: number;
  timeBand?: TimeBand;
  sort: SortOption;
  view: ViewMode;
  page: number;
};

/** Next.js hands searchParams through as this shape; arrays mean `?a=1&a=2`. */
export type RawSearchParams = Record<string, string | string[] | undefined>;

/** The first value, for a repeated or malformed parameter. */
function one(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

function oneOf<T extends string>(
  value: string | string[] | undefined,
  allowed: readonly string[],
): T | undefined {
  const raw = one(value);
  if (raw === undefined || raw === "") {
    return undefined;
  }
  return (allowed as readonly string[]).includes(raw) ? (raw as T) : undefined;
}

/**
 * A positive integer, or undefined.
 *
 * `?page=0` and `?page=-3` become no page rather than page 0, because an offset
 * of -48 throws in Postgres and a negative offset silently reads from the wrong
 * end of the list.
 */
function positiveInt(value: string | string[] | undefined): number | undefined {
  const raw = one(value);
  if (raw === undefined || !/^\d+$/.test(raw)) {
    return undefined;
  }
  const parsed = Number.parseInt(raw, 10);
  return parsed >= 1 ? parsed : undefined;
}

/** The report-count filter's three offered steps, as strings for URL matching. */
const MIN_REPORT_PARAM_VALUES: readonly string[] = MIN_REPORT_OPTIONS.map(String);

/** Parse a whole query string into the filters the results page understands. */
export function parseResultsParams(raw: RawSearchParams): ResultsParams {
  const sort = one(raw.sort);

  return {
    q: one(raw.q)?.trim() ?? "",
    category: one(raw.category) || undefined,
    agent: one(raw.agent) || undefined,
    outcome: oneOf<OutcomePill>(raw.outcome, OUTCOME_PILL_VALUES),
    // Only the one step the brief names. An arbitrary `?verified=9999` would be
    // a filter that matches everything while appearing to filter.
    verified: positiveInt(raw.verified) === 30 ? 30 : undefined,
    minReports: parseMinReports(raw.min_reports),
    timeBand: oneOf<TimeBand>(raw.time, TIME_BAND_VALUES),
    sort: isSortOption(sort) ? sort : DEFAULT_SORT,
    view: oneOf<ViewMode>(raw.view, VIEW_MODES) ?? "cards",
    page: positiveInt(raw.page) ?? 1,
  };
}

/**
 * `min_reports` as a number, or undefined for "any".
 *
 * Only the three offered steps are honoured. `?min_reports=7` means something
 * no filter offered, and guessing at it would put a filter in front of a reader
 * who never asked for one.
 */
function parseMinReports(value: string | string[] | undefined): number | undefined {
  const raw = one(value);
  if (raw === undefined || !MIN_REPORT_PARAM_VALUES.includes(raw)) {
    return undefined;
  }
  const parsed = Number.parseInt(raw, 10);
  return parsed === 0 ? undefined : parsed;
}

/** The query filters that `searchPlaybooks` accepts, derived from the URL. */
export function toListFilters(params: ResultsParams): Omit<ListPlaybooksFilters, "limit" | "offset"> {
  const filters: Omit<ListPlaybooksFilters, "limit" | "offset"> = {};

  // A category picked in the sidebar always wins over an outcome pill, for the
  // same reason `categorySlug` wins over `categorySlugs` in the query: it is the
  // more specific statement of intent.
  if (params.category) {
    filters.categorySlug = params.category;
  } else if (params.outcome) {
    Object.assign(filters, PILL_FILTERS[params.outcome]);
  }

  if (params.agent) {
    filters.agentSlug = params.agent;
  }
  if (params.verified !== undefined) {
    filters.verifiedWithinDays = params.verified;
  }
  if (params.minReports !== undefined) {
    filters.minReports = params.minReports;
  }
  if (params.timeBand) {
    const band = TIME_BANDS[params.timeBand];
    if (band.min !== undefined) {
      filters.minTimeMinutes = band.min;
    }
    if (band.max !== undefined) {
      filters.maxTimeMinutes = band.max;
    }
  }

  return filters;
}

/** Serialise params back to a query string, omitting everything at its default. */
export function toQueryString(params: Partial<ResultsParams>): string {
  const search = new URLSearchParams();

  if (params.q) search.set("q", params.q);
  if (params.category) search.set("category", params.category);
  if (params.agent) search.set("agent", params.agent);
  if (params.outcome) search.set("outcome", params.outcome);
  if (params.verified) search.set("verified", String(params.verified));
  if (params.minReports) search.set("min_reports", String(params.minReports));
  if (params.timeBand) search.set("time", params.timeBand);
  if (params.sort && params.sort !== DEFAULT_SORT) search.set("sort", params.sort);
  if (params.view && params.view !== "cards") search.set("view", params.view);
  if (params.page && params.page > 1) search.set("page", String(params.page));

  return search.toString();
}

/**
 * Build the href for a link that changes some of the current params.
 *
 * Passing `null` for a field clears it. Page resets to 1 on any change that
 * could alter *which* results are in the list — staying on page 7 after adding a
 * filter is how a reader lands on an empty page and concludes the filter found
 * nothing, when it found plenty on page 1.
 */
export function buildResultsHref(
  basePath: string,
  current: ResultsParams,
  changes: { [K in keyof ResultsParams]?: ResultsParams[K] | null },
): string {
  // `null` means "clear this filter", which is not the same as setting it to
  // undefined — spreading `changes` in would leave a `null` in the params that
  // `toQueryString` then reads as a value to serialise.
  const next: Partial<ResultsParams> = { ...current };
  for (const key of Object.keys(changes) as (keyof ResultsParams)[]) {
    const value = changes[key];
    if (value === null) {
      delete next[key];
    } else if (value !== undefined) {
      Object.assign(next, { [key]: value });
    }
  }

  const reshapesList =
    changes.q !== undefined ||
    changes.category !== undefined ||
    changes.agent !== undefined ||
    changes.outcome !== undefined ||
    changes.verified !== undefined ||
    changes.minReports !== undefined ||
    changes.timeBand !== undefined ||
    changes.sort !== undefined;

  if (reshapesList) {
    next.page = 1;
  }

  const query = toQueryString(next);
  return query.length > 0 ? `${basePath}?${query}` : basePath;
}

/** How many filter facets are active, for the "Filters (2)" button on mobile. */
export function activeFilterCount(params: ResultsParams): number {
  let count = 0;
  if (params.category) count += 1;
  if (params.agent) count += 1;
  if (params.outcome) count += 1;
  if (params.verified) count += 1;
  if (params.minReports) count += 1;
  if (params.timeBand) count += 1;
  return count;
}