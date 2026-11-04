// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";

import { LanderMotionProvider } from "../lander-motion";
import { ChangeCard } from "./change-card";
import { FloatingComposer } from "./floating-composer";
import { LanderComposer } from "./lander-composer";
import { LanderThread } from "./lander-thread";
import type { TurnView } from "./use-lander";

function wrap(ui: ReactNode) {
  return render(
    <TooltipProvider>
      <LanderMotionProvider onReplay={() => {}}>{ui}</LanderMotionProvider>
    </TooltipProvider>,
  );
}

afterEach(cleanup);

const HERO = { key: "hero", label: "Hero" };
const done: TurnView = {
  turn: {
    id: "t1",
    request: "Shorter and warmer",
    target: HERO,
    startedAt: 0,
    jobId: "j1",
    refused: null,
    before: [],
    editable: 2,
  },
  state: "done",
  steps: [
    { id: "read", label: "Read 2 lines in Hero", done: true },
    { id: "write", label: "Rewrote 2 lines", done: true },
    { id: "save", label: "Saved and checked the claims", done: true },
  ],
  lines: [
    { number: 1, before: "Glow in 7 days", after: "Glow in a week" },
    { number: 3, before: "Only $29 today", after: "Yours for $29" },
  ],
  closing: "Done. I rewrote 2 lines in Hero.",
  error: null,
  reason: "Redrafted Hero",
  versionAfter: 5,
  queued: false,
  took: 6,
};

describe("Lander (B3.1b)", () => {
  it("sends from the floating bar, or opens the panel", () => {
    const onSend = vi.fn();
    const onOpen = vi.fn();
    wrap(<FloatingComposer working={false} onSend={onSend} onOpen={onOpen} />);
    const field = screen.getByLabelText("Work with Lander");
    fireEvent.submit(field.closest("form") as HTMLFormElement);
    expect(onOpen).toHaveBeenCalledTimes(1); // nothing typed: just opens Lander
    fireEvent.change(field, { target: { value: "Make the hero punchier" } });
    expect(screen.getByRole("button", { name: "Send to Lander" })).toBeTruthy();
    fireEvent.submit(field.closest("form") as HTMLFormElement);
    expect(onSend).toHaveBeenCalledWith("Make the hero punchier");
    fireEvent.click(screen.getByRole("button", { name: "Open Lander" }));
    expect(onOpen).toHaveBeenCalledTimes(2);
  });

  it("sends from the panel's composer and can widen the request to the page", () => {
    const onSend = vi.fn();
    const onClear = vi.fn();
    wrap(
      <LanderComposer
        target={HERO}
        working={false}
        hasThread={false}
        focusSignal={0}
        onClearTarget={onClear}
        onSend={onSend}
      />,
    );
    const box = screen.getByLabelText("Ask Lander");
    expect(box.getAttribute("placeholder")).toBe(
      "Ask Lander to change the page",
    );
    fireEvent.change(box, { target: { value: "Warmer" } });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(onSend).toHaveBeenCalledWith("Warmer");
    fireEvent.click(
      screen.getByRole("button", {
        name: "Ask about the whole page instead of Hero",
      }),
    );
    expect(onClear).toHaveBeenCalled();
  });

  it("offers starting points when the thread is empty", () => {
    const onSuggestion = vi.fn();
    wrap(
      <LanderThread
        views={[]}
        suggestions={[
          {
            id: "page",
            text: "Rewrite the page for a first-time buyer",
            target: null,
            icon: "page",
          },
        ]}
        undoFor={() => "none"}
        onSuggestion={onSuggestion}
        onUndo={vi.fn()}
        onRedo={vi.fn()}
        onShow={vi.fn()}
        onRefine={vi.fn()}
        onRetry={vi.fn()}
        composer={<form aria-label="Composer" />}
      />,
    );
    expect(screen.getByText("What should we change?")).toBeTruthy();
    fireEvent.click(
      screen.getByText("Rewrite the page for a first-time buyer"),
    );
    expect(onSuggestion).toHaveBeenCalled();
  });

  it("tells a finished change: the steps, the lines before and after, Undo and the closing line", () => {
    const onUndo = vi.fn();
    const onShow = vi.fn();
    wrap(
      <LanderThread
        views={[done]}
        suggestions={[]}
        undoFor={() => "can-undo"}
        onSuggestion={vi.fn()}
        onUndo={onUndo}
        onRedo={vi.fn()}
        onShow={onShow}
        onRefine={vi.fn()}
        onRetry={vi.fn()}
        composer={<form aria-label="Composer" />}
      />,
    );
    expect(screen.getByText("Shorter and warmer")).toBeTruthy();
    expect(screen.getByText("Completed 3 steps · 6s")).toBeTruthy();
    expect(
      screen.getByText("I'll rewrite Hero with that in mind."),
    ).toBeTruthy();
    expect(screen.getByText("Glow in 7 days")).toBeTruthy();
    expect(screen.getByText("Glow in a week")).toBeTruthy();
    expect(screen.getByText("Done. I rewrote 2 lines in Hero.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(onUndo).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Show on page" }));
    expect(onShow).toHaveBeenCalled();
    // The steps fold away once it's done; the status line unfolds them.
    expect(screen.queryByText("Rewrote 2 lines")).toBeNull();
    fireEvent.click(screen.getByText("Completed 3 steps · 6s"));
    expect(screen.getByText("Rewrote 2 lines")).toBeTruthy();
  });

  it("shows an undone change with Redo", () => {
    const onRefine = vi.fn();
    wrap(
      <ChangeCard
        title="Hero"
        lines={done.lines}
        pending={false}
        skeletonRows={2}
        undo="undone"
        onUndo={vi.fn()}
        onRedo={vi.fn()}
        onShow={vi.fn()}
        onRefine={onRefine}
      />,
    );
    expect(screen.getByRole("button", { name: "Redo" })).toBeTruthy();
    expect(screen.getByText(/undone/)).toBeTruthy();
  });

  it("refines a change from its card", () => {
    const onRefine = vi.fn();
    wrap(
      <ChangeCard
        title="Hero"
        lines={done.lines}
        pending={false}
        skeletonRows={2}
        undo="can-undo"
        onUndo={vi.fn()}
        onRedo={vi.fn()}
        onShow={vi.fn()}
        onRefine={onRefine}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Ask Lander to edit/ }));
    const field = screen.getByLabelText("What should change in Hero?");
    fireEvent.change(field, { target: { value: "Even shorter" } });
    fireEvent.submit(field.closest("form") as HTMLFormElement);
    expect(onRefine).toHaveBeenCalledWith("Even shorter");
  });
});
