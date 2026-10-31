// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Analytics } from "@/lib/validators/analytics";

import { AnalyticsView } from "./analytics-view";

const DATA: Analytics = {
  range: "30d",
  since: "2026-09-29",
  bucket: "day",
  spend_usd: 1.39,
  pages_built: 3,
  average_page_cost_usd: 0.6,
  pages_published: 1,
  spend_over_time: [
    { start: "2026-10-27", spend_usd: 0.05 },
    { start: "2026-10-28", spend_usd: 0.55 },
    { start: "2026-10-29", spend_usd: 0 },
  ],
  by_brand: [
    { key: "a", label: "Lumé", spend_usd: 0.9 },
    { key: "b", label: "Bré", spend_usd: 0.49 },
  ],
  by_template: [{ key: "t", label: "Advertorial", spend_usd: 1.39 }],
  by_kind: Array.from({ length: 8 }, (_, i) => ({
    key: `k${i}`,
    label: `Kind ${i + 1}`,
    spend_usd: 1 - i / 10,
  })),
  pages_by_status: [
    { status: "needs_review", count: 1 },
    { status: "published", count: 1 },
  ],
};

describe("AnalyticsView", () => {
  it("leads with the figures, then spend over time and the breakdowns", () => {
    render(<AnalyticsView data={DATA} />);
    expect(screen.getByText("$1.39", { selector: "dd" })).toBeTruthy();
    expect(screen.getByText("$0.60", { selector: "dd" })).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "30 days" })
        .getAttribute("aria-current"),
    ).toBe("page");
    expect(screen.getByText("By day")).toBeTruthy();
    const brands = screen.getByText("By brand").closest("section")!;
    expect(within(brands).getByText("Lumé")).toBeTruthy();
    expect(within(brands).getByText("$0.90")).toBeTruthy();
    // Past six slices, the rest fold into Other.
    const kinds = screen.getByText("By kind of call").closest("section")!;
    expect(within(kinds).getByText("Other (3)")).toBeTruthy();
    expect(within(kinds).queryByText("Kind 8")).toBeNull();
    expect(screen.getByText("Needs review")).toBeTruthy();
  });

  it("shows the exact figure in a tooltip on hover, and keeps every value in a table", () => {
    render(<AnalyticsView data={DATA} />);
    const column = screen.getByRole("button", { name: "28 Oct: $0.55" });
    fireEvent.pointerEnter(column);
    const tip = screen.getByRole("tooltip");
    expect(within(tip).getByText("$0.55")).toBeTruthy();
    expect(within(tip).getByText("28 Oct")).toBeTruthy();
    expect(column.getAttribute("aria-describedby")).toBe(tip.id);
    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("row")).toHaveLength(4);
  });

  it("moves between columns with the arrow keys and hides the tooltip with Escape", () => {
    render(<AnalyticsView data={DATA} />);
    const columns = screen.getAllByRole("button", { name: /Oct: \$/ });
    // One tab stop: the latest column.
    expect(columns.map((c) => c.tabIndex)).toEqual([-1, -1, 0]);
    columns[2]!.focus();
    fireEvent.keyDown(columns[2]!, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(columns[1]);
    expect(within(screen.getByRole("tooltip")).getByText("$0.55")).toBeTruthy();
    fireEvent.keyDown(columns[1]!, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("says when analytics can't be loaded", () => {
    render(<AnalyticsView data={null} />);
    expect(screen.getByText(/couldn’t load analytics/)).toBeTruthy();
  });
});
