// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";

import { LanderMotionProvider } from "../lander-motion";
import { ChangeCard } from "./change-card";
import { FloatingComposer } from "./floating-composer";
import { LanderComposer } from "./lander-composer";
import { LanderRecents } from "./lander-recents";
import { LanderThread } from "./lander-thread";
import { ReplyActions } from "./reply-actions";
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
const lines = [
  { number: 1, before: "Glow in 7 days", after: "Glow in a week" },
  { number: 3, before: "Only $29 today", after: "Yours for $29" },
];
const done: TurnView = {
  turn: {
    id: "t1",
    request: "Shorter and warmer, then move the FAQ up",
    target: HERO,
    startedAt: 0,
    jobId: "j1",
    refused: null,
    saved: null,
    images: [],
    feedback: null,
  },
  state: "done",
  queued: false,
  plan: "I'll tighten the hero and move the questions up.",
  steps: [
    { label: "Read 2 lines in Hero", ok: true },
    { label: "Rewrote 2 lines in Hero", ok: true },
    { label: "Moved Questions up", ok: true },
    { label: "Saved the page and checked the claims", ok: true },
  ],
  changes: [
    {
      kind: "lines",
      label: "Rewrote 2 lines in Hero",
      section: "hero",
      section_label: "Hero",
      lines,
    },
    {
      kind: "section",
      label: "Moved Questions up",
      action: "move",
      key: "faq",
    },
  ],
  closing: "Done. I tightened the hero and moved the questions up.",
  error: null,
  reason: "Lander: rewrote 2 lines in Hero and 1 more change",
  versionAfter: 5,
  took: 6,
  feedback: null,
};

describe("Lander (B3.1b, B3.1c)", () => {
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
        stopping={false}
        onStop={vi.fn()}
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
    expect(onSend).toHaveBeenCalledWith("Warmer", []);
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
        onRate={vi.fn()}
        composer={<form aria-label="Composer" />}
      />,
    );
    expect(screen.getByText("What should we change?")).toBeTruthy();
    fireEvent.click(
      screen.getByText("Rewrite the page for a first-time buyer"),
    );
    expect(onSuggestion).toHaveBeenCalled();
  });

  it("tells a finished request: its plan, a card per change, one Undo and the closing line", () => {
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
        onRate={vi.fn()}
        composer={<form aria-label="Composer" />}
      />,
    );
    expect(screen.getByText(done.turn.request)).toBeTruthy();
    expect(screen.getByText("Completed 4 steps · 6s")).toBeTruthy();
    expect(screen.getByText("Glow in 7 days")).toBeTruthy();
    expect(screen.getByText("Glow in a week")).toBeTruthy();
    expect(screen.getAllByText("Moved Questions up").length).toBe(1); // its card; steps folded
    expect(screen.getByText("2 changes, one undo step")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(onUndo).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Show on page" }));
    expect(onShow).toHaveBeenCalledWith([1, 3], "hero");
    // The steps fold away once it's done; the status line unfolds them.
    expect(screen.queryByText("Read 2 lines in Hero")).toBeNull();
    fireEvent.click(screen.getByText("Completed 4 steps · 6s"));
    expect(screen.getByText("Read 2 lines in Hero")).toBeTruthy();
  });

  it("shows the steps as they happen, and Stop while Lander works", () => {
    const working: TurnView = {
      ...done,
      state: "working",
      plan: null,
      steps: [{ label: "Read 2 lines in Hero", ok: true }],
      changes: [],
      closing: null,
      took: null,
    };
    wrap(
      <LanderThread
        views={[working]}
        suggestions={[]}
        undoFor={() => "none"}
        onSuggestion={vi.fn()}
        onUndo={vi.fn()}
        onRedo={vi.fn()}
        onShow={vi.fn()}
        onRefine={vi.fn()}
        onRetry={vi.fn()}
        onRate={vi.fn()}
        composer={null}
      />,
    );
    expect(screen.getByText("Read 2 lines in Hero")).toBeTruthy();
    expect(screen.getByText("Thinking…")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
    cleanup();
    const onStop = vi.fn();
    wrap(
      <LanderComposer
        target={HERO}
        working
        hasThread
        stopping={false}
        onStop={onStop}
        focusSignal={0}
        onClearTarget={vi.fn()}
        onSend={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Stop Lander" }));
    expect(onStop).toHaveBeenCalled();
  });

  it("offers Redo once the request is undone", () => {
    wrap(
      <LanderThread
        views={[done]}
        suggestions={[]}
        undoFor={() => "undone"}
        onSuggestion={vi.fn()}
        onUndo={vi.fn()}
        onRedo={vi.fn()}
        onShow={vi.fn()}
        onRefine={vi.fn()}
        onRetry={vi.fn()}
        onRate={vi.fn()}
        composer={null}
      />,
    );
    expect(screen.getByRole("button", { name: "Redo" })).toBeTruthy();
    expect(screen.getByText(/one undo step · undone/)).toBeTruthy();
  });

  it("refines a change from its card", () => {
    const onRefine = vi.fn();
    wrap(
      <ChangeCard
        title="Hero"
        lines={lines}
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

  it("rates a reply: thumbs up, thumbs down with reasons and a note, and takes it back", () => {
    const onRate = vi.fn();
    const { rerender } = wrap(
      <ReplyActions text="Done." feedback={null} onRate={onRate} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Good reply" }));
    expect(onRate).toHaveBeenLastCalledWith({ rating: "up", reasons: [] });
    rerender(
      <TooltipProvider>
        <LanderMotionProvider onReplay={() => {}}>
          <ReplyActions
            text="Done."
            feedback={{ rating: "up", reasons: [] }}
            onRate={onRate}
          />
        </LanderMotionProvider>
      </TooltipProvider>,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Take back the thumbs up" }),
    );
    expect(onRate).toHaveBeenLastCalledWith(null);
    fireEvent.click(screen.getByRole("button", { name: "Bad reply" }));
    expect(onRate).toHaveBeenLastCalledWith({ rating: "down", reasons: [] });
    fireEvent.click(screen.getByRole("button", { name: "Changed too much" }));
    fireEvent.change(screen.getByLabelText("Anything else?"), {
      target: { value: "Too much at once" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send feedback" }));
    expect(onRate).toHaveBeenLastCalledWith({
      rating: "down",
      reasons: ["changed_too_much"],
      note: "Too much at once",
    });
    expect(screen.getByText("Thanks, that helps")).toBeTruthy();
  });

  it("lists the page's conversations in Recents and opens one", async () => {
    const onOpen = vi.fn();
    const onList = vi.fn().mockResolvedValue([
      {
        thread_id: "t2",
        title: "Rewrite the FAQ",
        requests: 1,
        started_at: new Date().toISOString(),
        last_at: new Date().toISOString(),
      },
      {
        thread_id: "t1",
        title: "Warmer hero",
        requests: 2,
        started_at: new Date().toISOString(),
        last_at: new Date().toISOString(),
      },
    ]);
    wrap(
      <LanderRecents
        current="t2"
        disabled={false}
        onList={onList}
        onOpen={onOpen}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Recents" }));
    const other = await screen.findByText("Warmer hero");
    expect(screen.getByText(/2 requests/)).toBeTruthy();
    expect(
      screen
        .getByText("Rewrite the FAQ")
        .closest("button")
        ?.getAttribute("aria-current"),
    ).toBe("true");
    fireEvent.click(other);
    expect(onOpen).toHaveBeenCalledWith("t1");
  });
});
