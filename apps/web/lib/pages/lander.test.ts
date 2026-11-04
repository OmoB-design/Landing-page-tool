import { describe, expect, it } from "vitest";

import type { DeskParagraph, DeskSection } from "@/lib/validators/desk";

import type { AgentMessage } from "@/lib/validators/agent";

import {
  changedLineNumbers,
  editableLines,
  replyFromEvents,
  statusLabel,
  suggestions,
  turnsFromThread,
} from "./lander";

const HERO = { key: "hero", label: "Hero" };
const agent = (data: Record<string, unknown>) => ({ data: { agent: data } });

describe("Lander's thread (B3.1b, B3.1c)", () => {
  it("reads a running request's plan, steps and changes from its job's events", () => {
    const lines = {
      kind: "lines",
      label: "Rewrote 2 lines in Hero",
      section: "hero",
      section_label: "Hero",
      lines: [
        { number: 1, before: "A", after: "B" },
        { number: 4, before: "C", after: "D" },
      ],
    };
    const reply = replyFromEvents([
      { data: null },
      agent({
        type: "step",
        label: "Read 6 lines in Hero",
        ok: true,
        change: null,
      }),
      agent({ type: "plan", text: "I'll tighten the hero." }),
      agent({ type: "step", label: lines.label, ok: true, change: lines }),
      agent({
        type: "step",
        label: "Couldn't move hero",
        ok: false,
        change: null,
      }),
      agent({ type: "nonsense" }),
      agent({ type: "closing", text: "Done." }),
    ]);
    expect(reply.plan).toBe("I'll tighten the hero.");
    expect(reply.steps.map((s) => [s.label, s.ok])).toEqual([
      ["Read 6 lines in Hero", true],
      ["Rewrote 2 lines in Hero", true],
      ["Couldn't move hero", false],
    ]);
    expect(reply.changes).toHaveLength(1);
    expect(reply.closing).toBe("Done.");
    expect(changedLineNumbers(reply.changes)).toEqual([1, 4]);
  });

  it("says where a request is in its status line", () => {
    const steps = [
      { label: "a", ok: true },
      { label: "b", ok: true },
    ];
    expect(statusLabel("starting", [], 2)).toBe("Working on it… 2s");
    expect(statusLabel("working", steps, 4, true)).toBe(
      "Waiting for a worker… 4s",
    );
    expect(statusLabel("done", steps, 9, false, 7)).toBe(
      "Completed 2 steps · 7s",
    );
    expect(statusLabel("stopped", steps.slice(0, 1), 9)).toBe(
      "Stopped after 1 step",
    );
    expect(statusLabel("failed", [], 9)).toBe("Couldn’t finish");
  });

  it("turns a saved conversation back into requests and replies", () => {
    const messages: AgentMessage[] = [
      {
        id: "m1",
        role: "user",
        job_id: "j1",
        created_at: "2026-11-04T10:00:00Z",
        content: { text: "Warmer", target: HERO },
      },
      {
        id: "m2",
        role: "assistant",
        job_id: "j1",
        created_at: "2026-11-04T10:00:20Z",
        content: { state: "done", steps: [], changes: [], closing: "Done." },
        feedback: { rating: "up", reasons: [] },
      },
      {
        id: "m3",
        role: "user",
        job_id: "j2",
        created_at: "2026-11-04T10:01:00Z",
        content: { text: "Shorter", target: null },
      },
      {
        id: "m4",
        role: "user",
        job_id: "j3",
        created_at: "2026-11-04T10:02:00Z",
        content: { text: "And the FAQ", target: null },
      },
    ];
    const turns = turnsFromThread(messages, "j3");
    expect(turns.map((t) => [t.request, t.jobId])).toEqual([
      ["Warmer", "j1"],
      ["Shorter", "j2"],
      ["And the FAQ", "j3"],
    ]);
    expect(turns[0]?.saved?.closing).toBe("Done.");
    expect(turns[0]?.feedback).toEqual({ rating: "up", reasons: [] });
    expect(turns[1]?.feedback).toBeNull();
    // A request with no reply: the running one waits for its job; another never finished.
    expect(turns[1]?.saved?.state).toBe("failed");
    expect(turns[2]?.saved).toBeNull();
  });

  it("shimmers only the lines it can change", () => {
    const p = (number: number, section: string, locked: boolean) =>
      ({ number, section, locked }) as DeskParagraph;
    const paras = [p(1, "hero", false), p(2, "hero", true), p(3, "faq", false)];
    expect(editableLines(paras, HERO)).toEqual([1]);
    expect(editableLines(paras, null)).toEqual([1, 3]);
  });

  it("suggests starting points from the page's sections", () => {
    const s = (key: string, label: string) =>
      ({
        key,
        label,
        removable: true,
        duplicable: false,
        group: 0,
      }) as DeskSection;
    const layout = [
      s("hero", "Hero"),
      s("benefits", "Benefits"),
      s("faq", "Questions"),
    ];
    const line = (number: number, section: string, locked = false) =>
      ({ number, text: `Line ${number}`, section, locked }) as DeskParagraph;
    const paras = [line(1, "hero"), line(2, "benefits"), line(3, "faq")];
    const picks = suggestions(layout, layout[1] ?? null, paras);
    expect(picks.map((x) => x.text)).toEqual([
      "Make Benefits shorter and easier to scan",
      "Give Hero a punchier headline",
      "Make Questions warmer and more reassuring",
      "Rewrite the page for a first-time buyer",
    ]);
    expect(picks.at(-1)?.target).toBeNull();

    // A section filled entirely from data isn't suggested (Lander would only refuse it).
    const lockedBenefits = [line(1, "hero"), line(2, "benefits", true)];
    expect(
      suggestions(layout, layout[1] ?? null, lockedBenefits).map((x) => x.id),
    ).toEqual(["sharpen", "page"]);
    expect(
      suggestions(layout, null, [line(1, "hero", true)]).map((x) => x.id),
    ).toEqual([]);
  });
});
