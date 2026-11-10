import { describe, expect, it } from "vitest";

import {
  NO_FILTERS,
  type PageListItem,
  activeFilterCount,
  filterPages,
  foldBatches,
  groupPages,
  groupPagesByStatus,
  pagesHref,
  parsePageFilters,
} from "@/lib/pages/list";
import { samplePages } from "@/lib/pages/sample";

const now = new Date("2026-10-08T12:00:00Z");

function page(overrides: Partial<PageListItem> & { id: string }): PageListItem {
  return {
    key: overrides.id.toUpperCase(),
    title: `Page ${overrides.id}`,
    status: "needs_review",
    origin: "owned",
    templateType: "advertorial",
    residueScore: null,
    costUsd: 1,
    createdAt: now,
    updatedAt: now,
    parentId: null,
    createdBy: { name: "Ada", isMe: true },
    ...overrides,
  };
}

describe("groupPagesByStatus", () => {
  it("orders groups Needs review → Building → Published → Approved → Failed and drops empty ones", () => {
    const groups = groupPagesByStatus([
      page({ id: "a", status: "failed" }),
      page({ id: "b", status: "published" }),
      page({ id: "c", status: "building" }),
      page({ id: "d", status: "needs_review" }),
    ]);
    expect(groups.map((g) => g.id)).toEqual([
      "needs_review",
      "building",
      "published",
      "failed",
    ]);
  });

  it("shows queued builds under Building", () => {
    const [group] = groupPagesByStatus([
      page({ id: "q", status: "queued" }),
      page({ id: "b", status: "building" }),
    ]);
    expect(group?.id).toBe("building");
    expect(group?.count).toBe(2);
  });

  it("sorts newest first", () => {
    const [group] = groupPagesByStatus([
      page({ id: "old", updatedAt: new Date("2026-10-01T00:00:00Z") }),
      page({ id: "new", updatedAt: new Date("2026-10-07T00:00:00Z") }),
    ]);
    expect(group?.rows.map((r) => r.id)).toEqual(["new", "old"]);
  });

  it("nests a re-build under its original in the same group and counts both", () => {
    const [group] = groupPagesByStatus([
      page({ id: "parent" }),
      page({ id: "child", parentId: "parent" }),
    ]);
    expect(group?.count).toBe(2);
    expect(group?.rows).toHaveLength(1);
    expect(group?.rows[0]?.children.map((c) => c.id)).toEqual(["child"]);
  });

  it("keeps copies with their original, in its group, Copy 1 first (B7.1)", () => {
    const groups = groupPagesByStatus([
      page({ id: "original", status: "published" }),
      page({
        id: "c2",
        status: "needs_review",
        parentId: "original",
        copyNumber: 2,
      }),
      page({
        id: "c1",
        status: "approved",
        parentId: "original",
        copyNumber: 1,
      }),
      page({ id: "other", status: "needs_review" }),
    ]);
    expect(groups.map((g) => [g.id, g.count])).toEqual([
      ["needs_review", 1],
      ["published", 3],
    ]);
    const published = groups.find((g) => g.id === "published");
    expect(published?.rows[0]?.children.map((c) => c.id)).toEqual(["c1", "c2"]);
  });

  it("shows a copy on its own when its original isn't in the list (filtered out, in Trash)", () => {
    const groups = groupPagesByStatus(
      filterPages(
        [
          page({ id: "original", status: "published" }),
          page({ id: "copy", parentId: "original", copyNumber: 1 }),
        ],
        { ...NO_FILTERS, status: ["needs_review"] },
      ),
    );
    expect(groups.map((g) => g.rows.map((r) => r.id))).toEqual([["copy"]]);
  });

  it("nests copies under their original when grouped by type or creator too", () => {
    const pages = [
      page({ id: "original", createdBy: { name: "Ada", isMe: true } }),
      page({
        id: "copy",
        parentId: "original",
        copyNumber: 1,
        createdBy: { name: "Bo", isMe: false },
      }),
    ];
    for (const group of ["type", "creator"] as const) {
      const groups = groupPages(pages, { group, order: "updated" });
      expect(groups.map((g) => g.rows.map((r) => r.id))).toEqual([
        ["original"],
      ]);
      expect(groups[0]?.rows[0]?.children.map((c) => c.id)).toEqual(["copy"]);
    }
  });

  it("returns no groups for no pages", () => {
    expect(groupPagesByStatus([])).toEqual([]);
  });
});

describe("samplePages", () => {
  it("has unique keys, times relative to now, and the signed-in user as 'me'", () => {
    const pages = samplePages(now, "Ada Lovelace");
    expect(new Set(pages.map((p) => p.key)).size).toBe(pages.length);
    expect(pages.every((p) => p.updatedAt <= now)).toBe(true);
    expect(pages.some((p) => p.createdBy.name === "Ada Lovelace")).toBe(true);
  });

  it("only gives residue scores to cloned pages", () => {
    const pages = samplePages(now, "Ada");
    expect(
      pages
        .filter((p) => p.residueScore !== null)
        .every((p) => p.origin === "cloned"),
    ).toBe(true);
  });
});

describe("page filters", () => {
  const pages = samplePages(now, "Ada");

  it("parses comma-separated params and ignores unknown values", () => {
    expect(
      parsePageFilters({
        status: "published,nope",
        origin: ["cloned"],
        type: undefined,
      }),
    ).toEqual({ status: ["published"], origin: ["cloned"], type: [] });
  });

  it("matches any option within a group and every group together", () => {
    const published = filterPages(pages, {
      ...NO_FILTERS,
      status: ["published"],
    });
    expect(published.map((p) => p.key).sort()).toEqual(["LUM-12", "LUM-8"]);

    const clonedPublished = filterPages(pages, {
      ...NO_FILTERS,
      status: ["published"],
      origin: ["cloned"],
    });
    expect(clonedPublished.map((p) => p.key)).toEqual(["LUM-8"]);
  });

  it("puts queued pages under Building and unknown template types under Other", () => {
    expect(
      filterPages(pages, { ...NO_FILTERS, status: ["building"] }).map(
        (p) => p.key,
      ),
    ).toEqual(["LUM-23", "VRD-9"]);
    expect(
      filterPages(pages, { ...NO_FILTERS, type: ["other"] }).map((p) => p.key),
    ).toEqual(["LUM-31"]);
  });

  it("builds /pages links that keep the view and filters", () => {
    expect(pagesHref("all", NO_FILTERS)).toBe("/pages");
    expect(
      pagesHref("mine", { ...NO_FILTERS, status: ["published", "failed"] }),
    ).toBe("/pages?view=mine&status=published%2Cfailed");
    expect(
      activeFilterCount({ status: ["published"], origin: ["owned"], type: [] }),
    ).toBe(2);
  });
});

describe("batch folders (B3.5b)", () => {
  const batch = { batchId: "b1", product: "Calm Serum", brand: "Lume" };
  it("folds a batch's pages into one folder in the group of its least finished page", () => {
    const pages = [
      page({
        id: "a",
        ...batch,
        status: "needs_review",
        costUsd: 0.2,
        templateId: "t1",
      }),
      page({
        id: "b",
        ...batch,
        status: "building",
        costUsd: 0.1,
        templateId: "t2",
      }),
      page({ id: "c", status: "needs_review" }),
      page({ id: "d", batchId: "solo", status: "needs_review" }), // a batch of one stays a page
    ];
    const folded = foldBatches(pages);
    expect(folded.map((p) => p.id)).toEqual(["batch:b1", "c", "d"]);
    const folder = folded[0];
    expect(folder?.status).toBe("building");
    expect(folder?.title).toBe("Calm Serum · Lume");
    expect(folder?.costUsd).toBeCloseTo(0.3);
    expect(folder?.folder).toMatchObject({
      batchId: "b1",
      ready: 1,
      active: 1,
    });
    expect(folder?.folder?.pages.map((p) => p.id)).toEqual(["a", "b"]);
    const groups = groupPagesByStatus(pages);
    expect(
      groups.find((g) => g.id === "building")?.rows.map((r) => r.id),
    ).toEqual(["batch:b1"]);
    // Grouped by template type, the pages show on their own.
    const byType = groupPages(pages, { group: "type", order: "updated" });
    expect(byType.flatMap((g) => g.rows.map((r) => r.id)).sort()).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
  });
});
