// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { DeskState } from "@/lib/validators/desk";

import { DeskProvider } from "./desk-context";
import { DeskPanel } from "./desk-panel";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const DESK: DeskState = {
  build: {
    id: "b1",
    status: "needs_review",
    page_version: 3,
    approved_at: null,
    approved_by: null,
  },
  fragments: [
    {
      id: "f0001",
      text: "Glow in 7 days",
      section: "hero",
      locked: false,
      edited: false,
      block: 1,
      kind: "Headline",
    },
    {
      id: "f0002",
      text: "$29",
      section: "hero",
      locked: true,
      edited: false,
      block: 2,
      kind: "Text",
    },
    {
      id: "f0003",
      text: "Is it gentle?",
      section: "faq",
      locked: false,
      edited: true,
      block: 3,
      kind: "Question",
    },
  ],
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
      edited: true,
      fragments: ["f0003"],
    },
  ],
  sections: { hero: "Hero", faq: "FAQ" },
  snapshots: [
    {
      seq: 2,
      reason: "Edited a line in faq",
      created_at: new Date().toISOString(),
      created_by: "me",
    },
  ],
};

function renderDesk(onChange = vi.fn()) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <DeskProvider
        buildId="b1"
        meId="me"
        initial={DESK}
        onChange={onChange}
        initialTab="copy"
      >
        <DeskPanel overview={<p>Overview content</p>} />
      </DeskProvider>
    </QueryClientProvider>,
  );
  return onChange;
}

afterEach(cleanup);

describe("DeskPanel", () => {
  it("lists the page's lines by section, locked ones not editable", () => {
    renderDesk();
    expect(screen.getByRole("tab", { name: /Copy 2/ })).toBeTruthy();
    expect(screen.getByText("Hero")).toBeTruthy();
    const faq = screen.getByRole("button", { name: "FAQ" });
    expect(faq.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(faq);
    expect(faq.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("Edited")).toBeTruthy();
    fireEvent.click(screen.getByText("$29"));
    expect(
      screen.queryByRole("textbox", { name: "Edit this line" }),
    ).toBeNull();
  });

  it("edits a line and saves it on the version it was opened on", () => {
    const onChange = renderDesk();
    fireEvent.click(screen.getByText("Glow in 7 days"));
    const editor = screen.getByRole("textbox", { name: "Edit this line" });
    const save = screen.getByRole("button", { name: "Save" });
    expect((save as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(editor, { target: { value: "Calmer skin in 7 days" } });
    fireEvent.keyDown(editor, { key: "Enter", metaKey: true });
    expect(onChange).toHaveBeenCalledWith("copy", {
      base_version: 3,
      edits: [
        {
          block: 1,
          original: "Glow in 7 days",
          text: "Calmer skin in 7 days",
        },
      ],
    });
  });

  it("filters lines by search", () => {
    renderDesk();
    fireEvent.change(screen.getByLabelText("Search the page’s words"), {
      target: { value: "gentle" },
    });
    expect(screen.queryByText("Glow in 7 days")).toBeNull();
    expect(screen.getByText("Is it gentle?")).toBeTruthy();
  });

  it("undoes and restores from History", () => {
    const onChange = renderDesk();
    fireEvent.mouseDown(screen.getByRole("tab", { name: /History 1/ }));
    const panel = screen.getByRole("tabpanel");
    fireEvent.click(
      within(panel).getByRole("button", {
        name: "Undo: Edited a line in faq",
      }),
    );
    expect(onChange).toHaveBeenLastCalledWith("undo", { base_version: 3 });
    fireEvent.click(within(panel).getByRole("button", { name: "Restore" }));
    expect(onChange).toHaveBeenLastCalledWith("restore", {
      base_version: 3,
      seq: 2,
    });
    expect(within(panel).getByText(/· You/)).toBeTruthy();
  });
});
