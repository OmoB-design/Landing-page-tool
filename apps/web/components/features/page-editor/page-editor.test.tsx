// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import type { DeskState } from "@/lib/validators/desk";

import { SectionPanel } from "./section-panel";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const DESK: DeskState = {
  build: {
    id: "b1",
    status: "needs_review",
    page_version: 4,
    approved_at: null,
    approved_by: null,
  },
  fragments: [],
  paragraphs: [
    {
      number: 1,
      kind: "Headline",
      section: "hero",
      text: "Glow in 7 days",
      locked: false,
      locked_parts: [],
      edited: false,
      fragments: ["f0001"],
    },
    {
      number: 2,
      kind: "Text",
      section: "hero",
      text: "$29",
      locked: true,
      locked_parts: ["$29"],
      edited: false,
      fragments: ["f0002"],
    },
    {
      number: 3,
      kind: "Question",
      section: "faq",
      text: "Is it gentle?",
      locked: false,
      locked_parts: [],
      edited: false,
      fragments: ["f0003"],
    },
  ],
  sections: { hero: "Hero", faq: "Questions" },
  snapshots: [
    {
      seq: 2,
      reason: "Moved Questions up",
      created_at: new Date().toISOString(),
      created_by: "u1",
    },
    {
      seq: 1,
      reason: "Edited a line in hero",
      created_at: new Date().toISOString(),
      created_by: "u1",
    },
  ],
  redraft: null,
  colors: { page: null, brand: null },
  layout: [
    {
      key: "hero",
      label: "Hero",
      removable: false,
      duplicable: true,
      group: 0,
    },
    {
      key: "faq",
      label: "Questions",
      removable: true,
      duplicable: false,
      group: 0,
    },
  ],
  can_redo: false,
};

afterEach(cleanup);

describe("page editor (B3.1a)", () => {
  it("lists the page's sections and moves, copies and improves the selected one", () => {
    const onEdit = vi.fn();
    const onImprove = vi.fn();
    render(
      <TooltipProvider>
        <SectionPanel
          layout={DESK.layout}
          paragraphs={DESK.paragraphs}
          selected="hero"
          busy={null}
          onSelect={vi.fn()}
          onEdit={onEdit}
          onImprove={onImprove}
        />
      </TooltipProvider>,
    );
    expect(screen.getByText("Section 1 of 2")).toBeTruthy();
    expect(screen.getByText("2 lines · 1 filled from data")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Move down" }));
    expect(onEdit).toHaveBeenCalledWith({
      type: "reorder",
      keys: ["faq", "hero"],
      moved: "hero",
    });
    fireEvent.click(screen.getByRole("button", { name: "Duplicate" }));
    expect(onEdit).toHaveBeenLastCalledWith({ type: "duplicate", key: "hero" });
    // Hero can't be removed (the template says so) and is already at the top.
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    fireEvent.click(screen.getByRole("button", { name: "Move up" }));
    expect(onEdit).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole("button", { name: /Improve with AI/ }));
    expect(onImprove).toHaveBeenCalledWith("hero");
    expect(screen.getByRole("button", { name: "02Questions" })).toBeTruthy();
  });
});
