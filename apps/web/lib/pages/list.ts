import type { Database } from "@/types/database";

import {
  DEFAULT_DISPLAY,
  type PageDisplay,
  type PageOrdering,
  setDisplayParams,
} from "./display";

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
  createdAt: Date;
  updatedAt: Date;
  /** Set for a re-build or variant, which nests under the original. */
  parentId: string | null;
  createdBy: { name: string; isMe: boolean };
};

export type StatusGroupId =
  "building" | "needs_review" | "approved" | "published" | "failed";

/**
 * List groups in display order (Figma: All Pages/states: Needs review, Building, Published,
 * Approved, Failed). Queued builds show under Building.
 */
export const STATUS_GROUPS: {
  id: StatusGroupId;
  label: string;
  statuses: Enums["build_status"][];
}[] = [
  { id: "needs_review", label: "Needs review", statuses: ["needs_review"] },
  { id: "building", label: "Building", statuses: ["queued", "building"] },
  { id: "published", label: "Published", statuses: ["published"] },
  { id: "approved", label: "Approved", statuses: ["approved"] },
  { id: "failed", label: "Failed", statuses: ["failed"] },
];

export type PageTreeRow = PageListItem & { children: PageListItem[] };

/** What a group collects, for its glyph: a status, a template type, a person, or everything. */
export type PageGroupKey =
  | { kind: "status"; status: StatusGroupId }
  | { kind: "type"; type: string }
  | { kind: "creator"; name: string }
  | { kind: "all" };

export type PageGroup = {
  /** The status id, template type, creator name, or "all". */
  id: string;
  key: PageGroupKey;
  label: string;
  /** Every page in the group, nested ones included. */
  count: number;
  rows: PageTreeRow[];
};

/** Publish threshold for a clone's residue score (DECISIONS.md D28, LP_RESIDUE_MIN_SCORE). */
export const RESIDUE_MIN_SCORE = 85;

const COMPARE: Record<
  PageOrdering,
  (a: PageListItem, b: PageListItem) => number
> = {
  updated: (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
  created: (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  cost: (a, b) =>
    b.costUsd - a.costUsd || b.updatedAt.getTime() - a.updatedAt.getTime(),
};

/** One group's rows in order, each re-build nested under its original when both are in it. */
function buildGroup(
  id: string,
  key: PageGroupKey,
  label: string,
  pages: PageListItem[],
  order: PageOrdering,
): PageGroup[] {
  if (pages.length === 0) return [];
  const members = [...pages].sort(COMPARE[order]);
  const ids = new Set(members.map((page) => page.id));
  const isNested = (page: PageListItem) =>
    page.parentId !== null && ids.has(page.parentId);
  const rows = members
    .filter((page) => !isNested(page))
    .map((page) => ({
      ...page,
      children: members.filter((child) => child.parentId === page.id),
    }));
  return [{ id, key, label, count: members.length, rows }];
}

/**
 * Groups pages as Display says (status by default; template type; creator, you first; or one
 * ungrouped list) and orders each group (last updated by default; newest first; cost). Each
 * re-build nests under its original when both are in the same group; a child whose original is
 * elsewhere or missing stays a top-level row so nothing is hidden. Empty groups are left out.
 */
export function groupPages(
  pages: PageListItem[],
  display: Pick<PageDisplay, "group" | "order"> = DEFAULT_DISPLAY,
): PageGroup[] {
  const { order } = display;
  switch (display.group) {
    case "status":
      return STATUS_GROUPS.flatMap((group) =>
        buildGroup(
          group.id,
          { kind: "status", status: group.id },
          group.label,
          pages.filter((page) => group.statuses.includes(page.status)),
          order,
        ),
      );
    case "type": {
      const types = [...new Set(pages.map((page) => page.templateType))].sort(
        (a, b) => typeRank(a) - typeRank(b) || a.localeCompare(b),
      );
      return types.flatMap((type) =>
        buildGroup(
          type,
          { kind: "type", type },
          typeLabel(type),
          pages.filter((page) => page.templateType === type),
          order,
        ),
      );
    }
    case "creator": {
      const people = [
        ...new Map(
          pages.map((page) => [page.createdBy.name, page.createdBy]),
        ).values(),
      ].sort(
        (a, b) =>
          Number(b.isMe) - Number(a.isMe) || a.name.localeCompare(b.name),
      );
      return people.flatMap((person) =>
        buildGroup(
          person.name,
          { kind: "creator", name: person.name },
          person.isMe ? `${person.name} (you)` : person.name,
          pages.filter((page) => page.createdBy.name === person.name),
          order,
        ),
      );
    }
    case "none":
      return buildGroup("all", { kind: "all" }, "All pages", pages, order);
  }
}

/** Status groups, last updated first (the default display). */
export function groupPagesByStatus(pages: PageListItem[]): PageGroup[] {
  return groupPages(pages, DEFAULT_DISPLAY);
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

const typeRank = (type: string) => {
  const index = TYPE_OPTIONS.findIndex((option) => option.id === type);
  return index === -1 ? TYPE_OPTIONS.length : index;
};

/** "long_form" → "Long form"; unknown types are humanised. */
const typeLabel = (type: string) =>
  TYPE_OPTIONS.find((option) => option.id === type)?.label ??
  (type.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase()) || "Other");

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

/**
 * The /pages URL for a view, filters and display choices, e.g.
 * /pages?view=mine&status=published&group=type.
 */
export function pagesHref(
  view: "all" | "mine",
  filters: PageFilters,
  display: PageDisplay = DEFAULT_DISPLAY,
): string {
  const params = new URLSearchParams();
  if (view === "mine") params.set("view", "mine");
  for (const key of ["status", "origin", "type"] as const) {
    if (filters[key].length > 0) params.set(key, filters[key].join(","));
  }
  setDisplayParams(params, display);
  const query = params.toString();
  return query ? `/pages?${query}` : "/pages";
}
