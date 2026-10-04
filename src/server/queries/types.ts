import type { Database, Json } from "@/lib/database.types";

/** A row from any table in the public schema. */
export type Row<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];

/** Same, for views. `public_reports` is a view, not a table, so it needs its own
 *  lookup — indexing into Tables for it is a compile error, which is the point. */
export type ViewRow<T extends keyof Database["public"]["Views"]> =
  Database["public"]["Views"][T]["Row"];

export type Tables = Database["public"]["Tables"];

export type Category = Row<"categories">;
export type Agent = Row<"agents">;
export type Playbook = Row<"playbooks">;
export type PlaybookStats = Row<"playbook_stats">;
export type Collection = Row<"collections">;
export type UseCase = Row<"use_cases">;
export type PublicReport = ViewRow<"public_reports">;
export type OutcomeReport = Row<"outcome_reports">;
export type PlaybookVersion = Row<"playbook_versions">;
export type PlaybookInput = Row<"playbook_inputs">;
export type PlaybookStep = Row<"playbook_steps">;
export type PlaybookSource = Row<"playbook_sources">;

/** Outcome types, as stored. Kept as a union so callers get exhaustiveness. */
export type OutcomeType =
  | "money_monthly"
  | "money_yearly"
  | "money_once"
  | "time_hours"
  | "binary";

/**
 * Thresholds below which a number must not be shown. Non-negotiable per
 * AGENTS.md: a percentage on three reports is noise dressed as a statistic, and
 * "never fabricate stats" applies to implying precision as much as to inventing
 * it.
 */
export const REPORT_THRESHOLD = 20;
export const AMOUNT_THRESHOLD = 10;
export const PROVEN_MIN_EVIDENCE_APPROVED = 3;

/**
 * A playbook plus the category and agent rows the UI always needs alongside it,
 * and the current version's content. This is the shape every page renders from,
 * so it is assembled once here rather than re-selected per component.
 */
export type PlaybookWithRelations = Playbook & {
  category: Category;
  primary_agent: Agent | null;
  stats: PlaybookStats | null;
};

/** Filters accepted by `listPlaybooks`. All optional; omitted means "no filter". */
export type ListPlaybooksFilters = {
  categorySlug?: string;
  agentSlug?: string;
  /** `money_*` / `time_hours` / `binary`, per the P5 filter groups. */
  outcomeGroup?: "save_money" | "save_time" | "other";
  verifiedWithinDays?: number;
  minReports?: number;
  /** Inclusive upper bound on `time_min`, in minutes. */
  maxTimeMinutes?: number;
  collectionSlug?: string;
  useCaseSlug?: string;
  limit?: number;
  offset?: number;
};

/** Every sort option the results page offers, in the order AGENTS.md lists them. */
export const SORT_OPTIONS = [
  "best_evidence",
  "most_tried",
  "highest_outcome",
  "recently_verified",
  "trending",
] as const;

export type SortOption = (typeof SORT_OPTIONS)[number];

export const DEFAULT_SORT: SortOption = "best_evidence";

export function isSortOption(value: string | undefined | null): value is SortOption {
  return typeof value === "string" && (SORT_OPTIONS as readonly string[]).includes(value);
}

export type { Database, Json };