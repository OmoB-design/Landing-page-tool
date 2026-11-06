// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PagesList } from "@/components/features/pages/pages-list";
import { groupPagesByStatus } from "@/lib/pages/list";
import { samplePages } from "@/lib/pages/sample";

// The row menu's Move to Trash (D92) calls server actions and the router.
vi.mock("@/lib/trash/actions", () => ({
  trashItem: vi.fn(),
  restoreItem: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

const now = new Date("2026-10-08T12:00:00Z");

describe("PagesList", () => {
  it("renders the sample pages grouped by status with keys, badges and row menus", () => {
    render(<PagesList groups={groupPagesByStatus(samplePages(now, "Ada"))} />);

    const groupNames = screen
      .getAllByRole("heading", { level: 2 })
      .map((h) => h.textContent);
    expect(groupNames).toEqual([
      "Needs review5",
      "Building2",
      "Published2",
      "Approved1",
      "Failed1",
    ]);

    const clone = screen.getByRole("link", { name: /LUM-56/ });
    expect(within(clone).getByText("Cloned")).toBeTruthy();
    expect(
      within(clone).getByText(/Source-leak score/).parentElement?.textContent,
    ).toBe("Source-leak score 92");
    expect(within(clone).getByText("$2.37")).toBeTruthy();
    expect(clone.getAttribute("href")).toBe("/pages/sample-lum-56");

    const owned = screen.getByRole("link", { name: /LUM-12/ });
    expect(within(owned).getByText("Owned")).toBeTruthy();
    expect(within(owned).queryByText(/Source-leak score/)).toBeNull();

    expect(
      screen.getByRole("button", { name: "Actions for LUM-23" }),
    ).toBeTruthy();
  });

  it("nests the re-build LUM-98 under LUM-45", () => {
    render(<PagesList groups={groupPagesByStatus(samplePages(now, "Ada"))} />);
    const parent = screen.getByRole("link", { name: /LUM-45/ }).closest("li");
    expect(within(parent!).getByRole("link", { name: /LUM-98/ })).toBeTruthy();
  });

  it("shows an empty state when there are no pages", () => {
    render(<PagesList groups={[]} />);
    expect(screen.getByRole("heading", { name: "No pages yet" })).toBeTruthy();
  });

  it("shows a batch as one folder row that opens its page (B3.5b)", () => {
    const base = samplePages(now, "Ada")[0];
    if (!base) throw new Error("no sample");
    const pages = ["x", "y"].map((id, i) => ({
      ...base,
      id,
      key: `BTC-${i + 1}`,
      batchId: "b1",
      product: "Calm Serum",
      brand: "Lume",
      templateId: `t${i}`,
      status: "needs_review" as const,
    }));
    render(<PagesList groups={groupPagesByStatus(pages)} />);
    const folder = screen.getByRole("link", { name: /2 pages/ });
    expect(folder.getAttribute("href")).toBe("/pages/batch/b1");
    expect(folder.textContent).toContain("Calm Serum");
    expect(within(folder).getByText("2/2 ready")).toBeTruthy();
    expect(screen.queryByRole("link", { name: /BTC-1/ })).toBeNull();
  });
});
