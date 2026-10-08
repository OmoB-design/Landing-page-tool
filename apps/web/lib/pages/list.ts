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
