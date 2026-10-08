import { describe, expect, it } from "vitest";

import {
  NO_FILTERS,
  type PageListItem,
  activeFilterCount,
  filterPages,
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
    updatedAt: now,
    parentId: null,
    createdBy: { name: "Ada", isMe: true },
    ...overrides,
  };
}

describe("groupPagesByStatus", () => {
  it("orders groups Building → Needs review → Approved → Published → Failed and drops empty ones", () => {
    const groups = groupPagesByStatus([
      page({ id: "a", status: "failed" }),
      page({ id: "b", status: "published" }),
      page({ id: "c", status: "building" }),
      page({ id: "d", status: "needs_review" }),
    ]);
    expect(groups.map((g) => g.id)).toEqual([
      "building",
      "needs_review",
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

  it("keeps a re-build top-level when its original is in another group", () => {
    const groups = groupPagesByStatus([
      page({ id: "parent", status: "published" }),
      page({ id: "child", status: "needs_review", parentId: "parent" }),
    ]);
    const review = groups.find((g) => g.id === "needs_review");
    expect(review?.rows.map((r) => r.id)).toEqual(["child"]);
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
