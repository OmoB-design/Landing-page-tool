import type { Database } from "@/types/database";

type Enums = Database["public"]["Enums"];

/** One built page as the Pages list shows it (a subset of a `builds` row and its template). */
export type PageListItem = {
  id: string;
  /** Human key, e.g. LUM-23 (DECISIONS.md D27). */
  key: string;
  title: string;
  status: Enums["build_status"];
  origin: Enums["template_origin"];
  /** Template type: advertorial, listicle, versus, comparison, long_form … */
  templateType: string;
  /** Clones only, once residue_scan has run. */
  residueScore: number | null;
  costUsd: number;
  updatedAt: Date;
  /** Set for a re-build or variant, which nests under the original. */
  parentId: string | null;
  createdBy: { name: string; isMe: boolean };
};

export type StatusGroupId =
  "building" | "needs_review" | "approved" | "published" | "failed";

/** List groups in display order (DESIGN.md §3). Queued builds show under Building. */
export const STATUS_GROUPS: {
  id: StatusGroupId;
  label: string;
  statuses: Enums["build_status"][];
}[] = [
  { id: "building", label: "Building", statuses: ["queued", "building"] },
  { id: "needs_review", label: "Needs review", statuses: ["needs_review"] },
  { id: "approved", label: "Approved", statuses: ["approved"] },
  { id: "published", label: "Published", statuses: ["published"] },
  { id: "failed", label: "Failed", statuses: ["failed"] },
];

export type PageTreeRow = PageListItem & { children: PageListItem[] };

export type PageGroup = {
  id: StatusGroupId;
  label: string;
  /** Every page in the group, nested ones included. */
  count: number;
  rows: PageTreeRow[];
};

/** Publish threshold for a clone's residue score (DECISIONS.md D28, LP_RESIDUE_MIN_SCORE). */
export const RESIDUE_MIN_SCORE = 85;

const newestFirst = (a: PageListItem, b: PageListItem) =>
  b.updatedAt.getTime() - a.updatedAt.getTime();

/**
 * Groups pages by status, newest first, and nests each re-build under its original when both
 * are in the same group. A child whose original is in another group, or missing, stays a
 * top-level row so nothing is hidden. Empty groups are left out.
 */
export function groupPagesByStatus(pages: PageListItem[]): PageGroup[] {
  return STATUS_GROUPS.flatMap((group) => {
    const members = pages
      .filter((page) => group.statuses.includes(page.status))
      .sort(newestFirst);
    if (members.length === 0) return [];

    const ids = new Set(members.map((page) => page.id));
    const isNested = (page: PageListItem) =>
      page.parentId !== null && ids.has(page.parentId);
    const rows = members
      .filter((page) => !isNested(page))
      .map((page) => ({
        ...page,
        children: members.filter((child) => child.parentId === page.id),
      }));
    return [{ id: group.id, label: group.label, count: members.length, rows }];
  });
}

// ── Filters (Pages toolbar → Filter) ─────────────────────────────────────────

export const ORIGIN_OPTIONS = [
  { id: "owned", label: "Owned" },
  { id: "cloned", label: "Cloned" },
] as const;

/** Template types offered as filters; anything else counts as "other". */
export const TYPE_OPTIONS = [
  { id: "advertorial", label: "Advertorial" },
  { id: "listicle", label: "Listicle" },
  { id: "versus", label: "Versus" },
  { id: "comparison", label: "Comparison" },
  { id: "long_form", label: "Long form" },
  { id: "other", label: "Other" },
] as const;

export type PageFilters = {
  status: StatusGroupId[];
  origin: Enums["template_origin"][];
  type: string[];
};

export const NO_FILTERS: PageFilters = { status: [], origin: [], type: [] };

const pick = <T extends string>(
  raw: string | string[] | undefined,
  allowed: readonly T[],
): T[] => {
  const values = (Array.isArray(raw) ? raw.join(",") : (raw ?? "")).split(",");
  return allowed.filter((id) => values.includes(id));
};

/** Reads ?status=…&origin=…&type=… (comma-separated); unknown values are ignored. */
export function parsePageFilters(
  params: Record<string, string | string[] | undefined>,
): PageFilters {
  return {
    status: pick(
      params.status,
      STATUS_GROUPS.map((group) => group.id),
    ),
    origin: pick(
      params.origin,
      ORIGIN_OPTIONS.map((option) => option.id),
    ),
    type: pick(
      params.type,
      TYPE_OPTIONS.map((option) => option.id),
    ),
  };
}

export function activeFilterCount(filters: PageFilters): number {
  return filters.status.length + filters.origin.length + filters.type.length;
}

const KNOWN_TYPES = new Set<string>(TYPE_OPTIONS.map((option) => option.id));

/** Pages matching every chosen group (within a group, any chosen option matches). */
export function filterPages(
  pages: PageListItem[],
  filters: PageFilters,
): PageListItem[] {
  return pages.filter((page) => {
    const group = STATUS_GROUPS.find((g) =>
      g.statuses.includes(page.status),
    )?.id;
    const type = KNOWN_TYPES.has(page.templateType)
      ? page.templateType
      : "other";
    return (
      (filters.status.length === 0 ||
        (group !== undefined && filters.status.includes(group))) &&
      (filters.origin.length === 0 || filters.origin.includes(page.origin)) &&
      (filters.type.length === 0 || filters.type.includes(type))
    );
  });
}

/** The /pages URL for a view and filters, e.g. /pages?view=mine&status=published. */
export function pagesHref(view: "all" | "mine", filters: PageFilters): string {
  const params = new URLSearchParams();
  if (view === "mine") params.set("view", "mine");
  for (const key of ["status", "origin", "type"] as const) {
    if (filters[key].length > 0) params.set(key, filters[key].join(","));
  }
  const query = params.toString();
  return query ? `/pages?${query}` : "/pages";
}
