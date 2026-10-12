import { describe, expect, it } from "vitest";

import {
  DEFAULT_DISPLAY,
  changedDisplayCount,
  parsePageDisplay,
} from "@/lib/pages/display";
import {
  NO_FILTERS,
  type PageListItem,
  groupPages,
  pagesHref,
} from "@/lib/pages/list";

const now = new Date("2026-10-08T12:00:00Z");
const minutes = (n: number) => new Date(now.getTime() - n * 60_000);

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

describe("page display", () => {
  it("parses group, order and hidden details, falling back to the defaults", () => {
    expect(parsePageDisplay({})).toEqual(DEFAULT_DISPLAY);
    expect(
      parsePageDisplay({
        group: "type",
        order: "cost",
        hide: "creator,cost,x",
      }),
    ).toEqual({ group: "type", order: "cost", hide: ["cost", "creator"] });
    expect(parsePageDisplay({ group: "nope", order: "nope" })).toEqual(
      DEFAULT_DISPLAY,
    );
  });

  it("counts the choices that differ from the defaults", () => {
    expect(changedDisplayCount(DEFAULT_DISPLAY)).toBe(0);
    expect(
      changedDisplayCount({ group: "none", order: "cost", hide: ["origin"] }),
    ).toBe(3);
  });

  it("keeps display choices in /pages links, leaving defaults out", () => {
    expect(pagesHref("mine", NO_FILTERS, DEFAULT_DISPLAY)).toBe(
      "/pages?view=mine",
    );
    expect(
      pagesHref("all", NO_FILTERS, {
        group: "creator",
        order: "created",
        hide: ["cost"],
      }),
    ).toBe("/pages?group=creator&order=created&hide=cost");
  });
});

describe("groupPages", () => {
  const pages = [
    page({
      id: "a",
      templateType: "listicle",
      costUsd: 3,
      updatedAt: minutes(1),
    }),
    page({
      id: "b",
      templateType: "advertorial",
      costUsd: 5,
      updatedAt: minutes(5),
      createdBy: { name: "Zed", isMe: false },
    }),
    page({
      id: "c",
      templateType: "quiz_bridge",
      costUsd: 1,
      updatedAt: minutes(3),
    }),
  ];

  it("groups by template type in the filter order, unknown types last", () => {
    const groups = groupPages(pages, { group: "type", order: "updated" });
    expect(groups.map((g) => g.label)).toEqual([
      "Advertorial",
      "Listicle",
      "Quiz bridge",
    ]);
    expect(groups[0]?.key).toEqual({ kind: "type", type: "advertorial" });
  });

  it("groups by creator with you first", () => {
    const groups = groupPages(pages, { group: "creator", order: "updated" });
    expect(groups.map((g) => g.label)).toEqual(["Ada (you)", "Zed"]);
    expect(groups[0]?.rows.map((r) => r.id)).toEqual(["a", "c"]);
  });

  it("lists everything in one group when not grouped, ordered by cost", () => {
    const groups = groupPages(pages, { group: "none", order: "cost" });
    expect(groups).toHaveLength(1);
    expect(groups[0]?.key).toEqual({ kind: "all" });
    expect(groups[0]?.rows.map((r) => r.id)).toEqual(["b", "a", "c"]);
  });

  it("orders newest first by when the build started", () => {
    const started = [
      page({ id: "old", createdAt: minutes(60), updatedAt: minutes(1) }),
      page({ id: "new", createdAt: minutes(2), updatedAt: minutes(2) }),
    ];
    const [group] = groupPages(started, { group: "status", order: "created" });
    expect(group?.rows.map((r) => r.id)).toEqual(["new", "old"]);
  });
});
