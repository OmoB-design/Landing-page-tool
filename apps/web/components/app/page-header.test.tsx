// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { EmptyState } from "@/components/app/empty-state";
import { ListToolbar } from "@/components/app/list-toolbar";
import { PageHeader } from "@/components/app/page-header";
import { SegmentedTabs } from "@/components/app/segmented-tabs";
import { PagesIcon } from "@/components/ui/icons";

const TABS = [
  { id: "all", label: "All pages", href: "/pages" },
  { id: "mine", label: "My pages", href: "/pages?view=mine" },
];

describe("PageHeader", () => {
  it("shows the title as the page heading, then the tabs", () => {
    render(
      <PageHeader
        icon={PagesIcon}
        title="Pages"
        tabs={<SegmentedTabs label="Page views" tabs={TABS} active="all" />}
      />,
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "Pages" }),
    ).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Page views" })).toBeTruthy();
  });
});

describe("SegmentedTabs", () => {
  it("marks only the active tab as the current page", () => {
    render(<SegmentedTabs label="Page views" tabs={TABS} active="mine" />);
    const mine = screen.getByRole("link", { name: "My pages" });
    const all = screen.getByRole("link", { name: "All pages" });
    expect(mine.getAttribute("aria-current")).toBe("page");
    expect(mine.getAttribute("href")).toBe("/pages?view=mine");
    expect(all.getAttribute("aria-current")).toBeNull();
  });
});

describe("ListToolbar", () => {
  it("shows the label and a count that reads well to screen readers", () => {
    render(<ListToolbar icon={PagesIcon} label="Pages" count={11} />);
    expect(screen.getByText("Pages")).toBeTruthy();
    expect(screen.getByText("11").textContent).toBe("11 pages");
  });
});

describe("EmptyState", () => {
  it("renders the title, body and action", () => {
    render(
      <EmptyState
        title="No pages yet"
        action={<button type="button">New page</button>}
      >
        Pages you build appear here.
      </EmptyState>,
    );
    expect(screen.getByRole("heading", { name: "No pages yet" })).toBeTruthy();
    expect(screen.getByText("Pages you build appear here.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "New page" })).toBeTruthy();
  });
});
