import { describe, expect, it } from "vitest";

import type { DeskParagraph, DeskSection } from "@/lib/validators/desk";

import {
  changedLines,
  closingSentence,
  editableLines,
  planSentence,
  statusLabel,
  stepsFrom,
  suggestions,
} from "./lander";

const HERO = { key: "hero", label: "Hero" };
const msg = (...messages: string[]) => messages.map((message) => ({ message }));

describe("Lander's thread (B3.1b)", () => {
  it("says what it will do before it starts", () => {
    expect(planSentence(HERO, "shorter and warmer")).toBe(
      "I'll rewrite Hero with that in mind.",
    );
    expect(planSentence(null, "")).toBe("I'll give the page fresh words.");
  });

  it("tells the redraft's progress as steps that run, then tick", () => {
    const start = stepsFrom([], HERO, 6, false);
    expect(start).toEqual([
      { id: "read", label: "Read 6 lines in Hero", done: true },
    ]);
    expect(statusLabel(start, "starting", 2)).toBe("Thinking… 2s");
    expect(statusLabel(start, "working", 4, true)).toBe(
      "Waiting for a worker… 4s",
    );

    const writing = stepsFrom(msg("Writing 6 lines"), HERO, 6, false);
    expect(writing.at(-1)).toEqual({
      id: "write",
      label: "Rewriting 6 lines…",
      done: false,
    });
    expect(statusLabel(writing, "working", 3)).toBe("Rewriting 6 lines…");

    const wrote = stepsFrom(
      msg("Writing 6 lines", "Wrote 5 of 6 lines"),
      HERO,
      6,
      false,
    );
    expect(wrote.map((s) => [s.label, s.done])).toEqual([
      ["Read 6 lines in Hero", true],
      ["Rewrote 5 of 6 lines", true],
      ["Saving and checking the claims…", false],
    ]);

    const saved = stepsFrom(
      msg("Writing 1 line", "Wrote 1 of 1 line", "Saved the page"),
      null,
      1,
      true,
    );
    expect(saved.map((s) => s.label)).toEqual([
      "Read 1 line in the page",
      "Rewrote 1 line",
      "Saved and checked the claims",
    ]);
    expect(statusLabel(saved, "done", 9)).toBe("Completed 3 steps");
    expect(statusLabel(saved, "failed", 9)).toBe("Stopped");
  });

  it("compares the target's lines before and after", () => {
    const before = [
      { number: 1, text: "Glow in 7 days", section: "hero" },
      { number: 2, text: "Is it gentle?", section: "faq" },
    ];
    const after = [
      { number: 1, text: "Glow in a week", section: "hero" },
      { number: 2, text: "Is it kind?", section: "faq" },
    ];
    expect(changedLines(before, after, "hero")).toEqual([
      { number: 1, before: "Glow in 7 days", after: "Glow in a week" },
    ]);
    expect(changedLines(before, after, null)).toHaveLength(2);
  });

  it("closes with what it did, the lines it left and any that kept their words", () => {
    expect(closingSentence(HERO, 6, 0, 0)).toBe(
      "Done. I rewrote 6 lines in Hero.",
    );
    expect(closingSentence(null, 9, 2, 1)).toBe(
      "Done. I rewrote 9 lines in the page. I left the 2 lines you'd edited by hand. A few lines kept their words.",
    );
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
