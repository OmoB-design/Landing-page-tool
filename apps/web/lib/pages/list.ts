import type { FolderColor } from "@/lib/validators/build";
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
  /** Set for a re-build or a copy, which nests under the original (the family's first page). */
  parentId: string | null;
  /** A copy's number in its family (B7.1, D144): "Copy 2". */
  copyNumber?: number | null;
  createdBy: { name: string; isMe: boolean };
  /** Pages started together (B3.5, D115) share one; they show as a folder (B3.5b). */
  batchId?: string | null;
  product?: string;
  brand?: string;
  templateId?: string;
  /** Its batch's folder colour, the team's pick (B3.5b); red until then. */
  folderColor?: FolderColor;
  /** Set on the folder row that stands for a batch's pages. */
  folder?: BatchFolder;
};

/** A batch's pages folded into one row of the Pages list (B3.5b, owner 2026-11-06). */
export type BatchFolder = {
  batchId: string;
  product: string;
  brand: string;
  pages: PageListItem[];
  ready: number;
  active: number;
  color: FolderColor;
};

const READY_STATUSES = new Set(["needs_review", "approved", "published"]);
// A folder sits in the group of its least finished page: building while any is, then review,
// then a failure, then approved, then published.
const FOLDER_STATUS: Enums["build_status"][] = [
  "needs_review",
  "failed",
  "approved",
  "published",
];

/**
 * A batch's pages (two or more of them here) become one folder row; everything else is as it
 * was. The folder takes the batch's newest change, its first creation, its total cost, and the
 * status of its least finished page (B3.5b).
 */
export function foldBatches(pages: PageListItem[]): PageListItem[] {
  const byBatch = new Map<string, PageListItem[]>();
  for (const page of pages)
    if (page.batchId)
      byBatch.set(page.batchId, [...(byBatch.get(page.batchId) ?? []), page]);
  const folded = new Set<string>();
  const out: PageListItem[] = [];
  for (const page of pages) {
    const members = page.batchId ? byBatch.get(page.batchId) : undefined;
    if (!page.batchId || !members || members.length < 2) {
      out.push(page);
      continue;
    }
    if (folded.has(page.batchId)) continue;
    folded.add(page.batchId);
    const statuses = new Set(members.map((m) => m.status));
    const status: Enums["build_status"] =
      statuses.has("queued") || statuses.has("building")
        ? "building"
        : (FOLDER_STATUS.find((s) => statuses.has(s)) ?? page.status);
    const first = members.reduce((a, b) =>
      a.createdAt <= b.createdAt ? a : b,
    );
    out.push({
      ...first,
      id: `batch:${page.batchId}`,
      key: "",
      title: `${first.product ?? "Batch"} · ${first.brand ?? ""}`,
      status,
      templateType: "batch",
      residueScore: null,
      costUsd: members.reduce((sum, m) => sum + m.costUsd, 0),
      createdAt: first.createdAt,
      updatedAt: new Date(
        Math.max(...members.map((m) => m.updatedAt.getTime())),
      ),
      parentId: null,
      folder: {
        batchId: page.batchId,
        product: first.product ?? "Batch",
        brand: first.brand ?? "",
        color: first.folderColor ?? "red",
        pages: members,
        ready: members.filter((m) => READY_STATUSES.has(m.status)).length,
        active: members.filter(
          (m) => m.status === "queued" || m.status === "building",
        ).length,
      },
    });
  }
  return out;
}

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

/**
 * Copies and re-builds nest under their original whenever it's in the list (B7.1, D144: the
 * family stays together, in the original's group, each copy with its own status), in the order
 * they were made (Copy 1, Copy 2…). One whose original isn't there (filtered out, in Trash) stays
 * a row of its own, so nothing is hidden.
 */
export function nestCopies(pages: PageListItem[]): {
  tops: PageListItem[];
  under: Map<string, PageListItem[]>;
} {
  const ids = new Set(pages.map((page) => page.id));
  const under = new Map<string, PageListItem[]>();
  const tops: PageListItem[] = [];
  for (const page of pages) {
    if (page.parentId !== null && ids.has(page.parentId))
      under.set(page.parentId, [...(under.get(page.parentId) ?? []), page]);
    else tops.push(page);
  }
  for (const children of under.values())
    children.sort(
      (a, b) =>
        (a.copyNumber ?? Infinity) - (b.copyNumber ?? Infinity) ||
        a.createdAt.getTime() - b.createdAt.getTime(),
    );
  return { tops, under };
}

/** One group's rows in order, each with the copies and re-builds nested under it. */
function buildGroup(
  id: string,
  key: PageGroupKey,
  label: string,
  pages: PageListItem[],
  order: PageOrdering,
  under: Map<string, PageListItem[]>,
): PageGroup[] {
  if (pages.length === 0) return [];
  const rows = [...pages]
    .sort(COMPARE[order])
    .map((page) => ({ ...page, children: under.get(page.id) ?? [] }));
  const count = rows.reduce((sum, row) => sum + 1 + row.children.length, 0);
  return [{ id, key, label, count, rows }];
}

/**
 * Groups pages as Display says (status by default; template type; creator, you first; or one
 * ungrouped list) and orders each group (last updated by default; newest first; cost). Copies and
 * re-builds nest under their original, in its group (nestCopies). Empty groups are left out.
 */
export function groupPages(
  all: PageListItem[],
  display: Pick<PageDisplay, "group" | "order"> = DEFAULT_DISPLAY,
): PageGroup[] {
  const { order } = display;
  // A batch's pages share a folder (B3.5b), except grouped by template type, where they differ.
  const { tops: pages, under } = nestCopies(
    display.group === "type" ? all : foldBatches(all),
  );
  switch (display.group) {
    case "status":
      return STATUS_GROUPS.flatMap((group) =>
        buildGroup(
          group.id,
          { kind: "status", status: group.id },
          group.label,
          pages.filter((page) => group.statuses.includes(page.status)),
          order,
          under,
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
          under,
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
          under,
        ),
      );
    }
    case "none":
      return buildGroup(
        "all",
        { kind: "all" },
        "All pages",
        pages,
        order,
        under,
      );
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
