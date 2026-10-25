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
import { InksCard } from "./inks-card";

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
  redraft: null,
  colors: {
    page: {
      primary: "#2f6fde",
      dark: "#1d4ea6",
      tint: "#eaf1fd",
      accent: "#2f6fde",
    },
    brand: {
      primary: "#7a2e8f",
      dark: "#4a1c57",
      tint: "#f4eaf6",
      accent: "#7a2e8f",
    },
  },
};

function renderDesk(onChange = vi.fn(), initial: DeskState = DESK) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <DeskProvider
        buildId="b1"
        meId="me"
        initial={initial}
        onChange={onChange}
        initialTab="copy"
      >
        <DeskPanel overview={<InksCard />} />
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

  it("redrafts a section after asking, with the note", () => {
    const onChange = renderDesk();
    // FAQ's only line was edited by hand, so there's nothing there to redraft.
    expect(
      (screen.getByRole("button", { name: "Redraft FAQ" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Redraft Hero" }));
    expect(
      screen.getByText(
        /Claude writes new words for 1 line, in the brand’s voice/,
      ),
    ).toBeTruthy();
    fireEvent.change(
      screen.getByLabelText("A note for the new words (optional)"),
      { target: { value: "warmer" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Redraft" }));
    expect(onChange).toHaveBeenLastCalledWith("redraft", {
      base_version: 3,
      scope: "section",
      section: "hero",
      note: "warmer",
    });
  });

  it("pauses the lines while a redraft runs and shimmers the ones it rewrites", () => {
    renderDesk(vi.fn(), {
      ...DESK,
      redraft: {
        job_id: "j1",
        status: "queued",
        scope: "section",
        section: "hero",
        block: null,
      },
    });
    expect(screen.getByText("Redrafting Hero…")).toBeTruthy();
    expect(screen.getByText(/Waiting for a worker/)).toBeTruthy();
    const row = screen.getByText("Glow in 7 days").closest("button");
    expect(row?.disabled).toBe(true);
    expect(row?.getAttribute("aria-busy")).toBe("true");
    const other = screen.getByText("Is it gentle?").closest("button");
    expect(other?.disabled).toBe(true);
    expect(other?.getAttribute("aria-busy")).toBeNull();
    expect(
      (
        screen.getByRole("button", {
          name: "Redraft the page",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it("recolours the page, working out the dark and tint from a new primary", () => {
    const onChange = renderDesk();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Overview" }));
    fireEvent.change(screen.getByLabelText("Primary colour"), {
      target: { value: "#c0392b" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Brand colours" }));
    // Back to the brand's colours, then recolour to them.
    fireEvent.click(screen.getByRole("button", { name: "Recolour page" }));
    expect(onChange).toHaveBeenLastCalledWith("recolor", {
      base_version: 3,
      colors: DESK.colors.brand,
    });
    fireEvent.change(screen.getByLabelText("Primary colour"), {
      target: { value: "#c0392b" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Recolour page" }));
    const sent = onChange.mock.lastCall?.[1] as {
      colors: Record<string, string>;
    };
    expect(sent.colors.primary).toBe("#c0392b");
    expect(sent.colors.dark).not.toBe(DESK.colors.brand?.dark);
    expect(sent.colors.accent).toBe(DESK.colors.brand?.accent);
  });
});
