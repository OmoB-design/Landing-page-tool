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
      hidden: false,
    },
    {
      key: "faq",
      label: "Questions",
      removable: true,
      duplicable: false,
      group: 0,
      hidden: false,
    },
  ],
  can_redo: false,
};

afterEach(cleanup);

const HEADLINE = {
  kind: "text" as const,
  name: "Headline",
  role: "headline",
  excerpt: "Glow in 7 days",
  line: 1,
  image: null,
  thumb: "",
  hidden: false,
};
const PICTURE = {
  kind: "image" as const,
  name: "Scene picture",
  role: "scene",
  excerpt: "",
  line: null,
  image: 3,
  thumb: "",
  hidden: false,
};
const PARTS = [
  {
    key: "hero",
    name: "Headline and byline",
    loose: false,
    parts: [HEADLINE, PICTURE],
  },
  { key: "faq", name: "Questions", loose: false, parts: [] },
];

function panel(props: Partial<React.ComponentProps<typeof SectionPanel>>) {
  const all: React.ComponentProps<typeof SectionPanel> = {
    layout: DESK.layout,
    paragraphs: DESK.paragraphs,
    parts: PARTS,
    selected: "hero",
    part: null,
    open: true,
    hovered: null,
    busy: null,
    reduced: true,
    onSelect: vi.fn(),
    onSelectPart: vi.fn(),
    onClose: vi.fn(),
    onHover: vi.fn(),
    onEdit: vi.fn(),
    onAsk: vi.fn(),
    onType: vi.fn(),
    expanded: [],
    onExpand: vi.fn(),
    card: {
      enter: { duration: 0 },
      exit: { duration: 0 },
      scaleFrom: 1,
      blurFrom: 0,
    },
    ...props,
  };
  const view = render(
    <TooltipProvider>
      <SectionPanel {...all} />
    </TooltipProvider>,
  );
  // Renders again with some props changed (the desk moving on underneath).
  const rerender = (more: Partial<React.ComponentProps<typeof SectionPanel>>) =>
    view.rerender(
      <TooltipProvider>
        <SectionPanel {...all} {...more} />
      </TooltipProvider>,
    );
  return { ...all, rerender };
}

describe("page editor's section tree (B3.1a, B4.4)", () => {
  it("opens the chosen section's panel: move, copy and Ask Buddy", () => {
    const props = panel({});
    expect(screen.getByText("· Section 1 of 2")).toBeTruthy();
    expect(screen.getByText("2 lines · 1 filled from data")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Move down" }));
    expect(props.onEdit).toHaveBeenCalledWith({
      type: "reorder",
      keys: ["faq", "hero"],
      moved: "hero",
    });
    fireEvent.click(screen.getByRole("button", { name: "Duplicate" }));
    expect(props.onEdit).toHaveBeenLastCalledWith({
      type: "duplicate",
      key: "hero",
    });
    // Hero can't be removed (the template says so) and is already at the top.
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    fireEvent.click(screen.getByRole("button", { name: "Move up" }));
    expect(props.onEdit).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole("button", { name: "Ask Buddy to edit" }));
    expect(props.onAsk).toHaveBeenCalledWith("hero", null);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(props.onClose).toHaveBeenCalled();
  });

  it("opens a section into its parts, named as in Shopify", () => {
    const props = panel({ open: false, expanded: ["hero"] });
    expect(screen.queryByText(/Section 1 of 2/)).toBeNull(); // no panel
    expect(screen.getByText("— Glow in 7 days")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Scene picture" }));
    expect(props.onSelectPart).toHaveBeenCalledWith("hero", PICTURE);
    fireEvent.mouseEnter(screen.getByText("— Glow in 7 days"));
    expect(props.onHover).toHaveBeenCalledWith({
      key: "hero",
      line: 1,
      image: undefined,
    });
    fireEvent.click(screen.getByRole("button", { name: "Open Questions" }));
    expect(props.onExpand).not.toHaveBeenCalled(); // nothing inside to open
    fireEvent.click(screen.getByRole("button", { name: "Close Hero" }));
    expect(props.onExpand).toHaveBeenCalledWith("hero", false);
    // Shopify's eye: hide a line, or a section.
    fireEvent.click(screen.getByRole("button", { name: "Hide Headline" }));
    expect(props.onEdit).toHaveBeenCalledWith({
      type: "hide",
      hidden: true,
      block: 1,
    });
    fireEvent.click(screen.getByRole("button", { name: "Hide Questions" }));
    expect(props.onEdit).toHaveBeenLastCalledWith({
      type: "hide",
      key: "faq",
      hidden: true,
    });
  });

  it("edits a part's words in its panel, saved against the words it started from", () => {
    const props = panel({ part: HEADLINE, expanded: ["hero"] });
    const field = screen.getByRole("textbox", { name: "Headline" });
    fireEvent.change(field, { target: { value: "Glow in a week" } });
    expect(props.onType).toHaveBeenLastCalledWith(
      1,
      "Glow in a week",
      false,
      "Glow in 7 days",
    );
    fireEvent.blur(field);
    expect(props.onType).toHaveBeenLastCalledWith(
      1,
      "Glow in a week",
      true,
      "Glow in 7 days",
    );
    fireEvent.click(screen.getByRole("button", { name: "Ask Buddy to edit" }));
    expect(props.onAsk).toHaveBeenCalledWith("hero", HEADLINE);
  });

  it("follows the line while you aren't typing, and keeps your words while you are (B5.1)", () => {
    const props = panel({ part: HEADLINE, expanded: ["hero"] });
    const changed = (text: string) =>
      DESK.paragraphs.map((p) => (p.number === 1 ? { ...p, text } : p));
    // Buddy rewrote the line: the field shows it.
    props.rerender({ paragraphs: changed("Glow fast") });
    const field = screen.getByRole("textbox", { name: "Headline" });
    expect((field as HTMLTextAreaElement).value).toBe("Glow fast");
    // Typing, then the line changes elsewhere: your words stay, saved against "Glow fast".
    fireEvent.change(field, { target: { value: "Glow fast, truly" } });
    props.rerender({ paragraphs: changed("Someone else's words") });
    expect((field as HTMLTextAreaElement).value).toBe("Glow fast, truly");
    expect(props.onType).toHaveBeenLastCalledWith(
      1,
      "Glow fast, truly",
      false,
      "Glow fast",
    );
  });
});
