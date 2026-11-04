/**
 * Lander, the page editor's AI (B3.1b, D105): its conversation, kept apart from the components so
 * the rules can be tested. In B3.1b a request runs the section (or page) redraft with the request as
 * its note; the thread tells it as Sidekick's and the reference video's do: a plan sentence, steps
 * that run then tick (from the redraft job's progress), a change card with the lines before and
 * after, and a closing line. The agent that plans its own steps comes in B3.1c.
 */
import type { JobEvent } from "@/lib/validators/jobs";
import type { DeskParagraph, DeskSection } from "@/lib/validators/desk";

/** What a request is about: a section of the page, or the whole page (null). */
export type LanderTarget = { key: string; label: string } | null;

/** A line of the page, as Lander keeps it to show what changed. */
export type LanderLine = {
  number: number;
  text: string;
  section: string | null;
};

export type LanderStep = {
  id: "read" | "write" | "save";
  /** "Rewriting 6 lines…" while it runs, "Rewrote 6 lines" once done. */
  label: string;
  done: boolean;
};

/** A request and what Lander did with it. */
export type LanderTurn = {
  id: string;
  request: string;
  target: LanderTarget;
  startedAt: number;
  /** The redraft's job, once started; null while starting or when it was refused. */
  jobId: string | null;
  /** Refused before it started (the message says why). */
  refused: string | null;
  /** The page's lines when the request was sent: what the change card compares against. */
  before: LanderLine[];
  /** How many lines in the target could change (not filled from data). */
  editable: number;
};

/** The longest request the redraft takes as its note (worker RedraftRequest.note). */
export const REQUEST_MAX = 200;

/** Words a line needs (any script) or a price, as the worker checks (paragraphs.rewrite). */
const WORDS = /\p{L}/u;

export function targetName(target: LanderTarget): string {
  return target ? target.label : "the page";
}

/** The sentence Lander opens with: what it's going to do. */
export function planSentence(target: LanderTarget, request: string): string {
  const name = targetName(target);
  return WORDS.test(request)
    ? `I'll rewrite ${name} with that in mind.`
    : `I'll give ${name} fresh words.`;
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

/**
 * The steps so far, from the redraft job's progress ("Writing 6 lines", "Wrote 6 of 6 lines",
 * "Saved the page"): reading the target (done at once), rewriting its lines, then saving and
 * checking the claims. A step runs until the next event says it's done.
 */
export function stepsFrom(
  events: Pick<JobEvent, "message">[],
  target: LanderTarget,
  editable: number,
  finished: boolean,
): LanderStep[] {
  const name = targetName(target);
  const steps: LanderStep[] = [
    {
      id: "read",
      label: `Read ${plural(editable, "line")} in ${name}`,
      done: true,
    },
  ];
  const messages = events.map((e) => e.message);
  const writing = messages.find((m) => /^Writing \d+ lines?$/.test(m));
  const wrote = messages.find((m) => /^Wrote \d+ of \d+ lines?$/.test(m));
  const saved = messages.includes("Saved the page");
  if (!writing && !wrote) return steps;
  const total = Number((writing ?? wrote ?? "").match(/\d+/g)?.at(-1) ?? 0);
  if (wrote) {
    const [done = 0, of = total] = (wrote.match(/\d+/g) ?? []).map(Number);
    steps.push({
      id: "write",
      label:
        done === of
          ? `Rewrote ${plural(done, "line")}`
          : `Rewrote ${done} of ${plural(of, "line")}`,
      done: true,
    });
    steps.push({
      id: "save",
      label:
        saved || finished
          ? "Saved and checked the claims"
          : "Saving and checking the claims…",
      done: saved || finished,
    });
  } else {
    steps.push({
      id: "write",
      label: `Rewriting ${plural(total, "line")}…`,
      done: false,
    });
  }
  return steps;
}

/**
 * The status line over the reply: waiting for a worker or thinking (with seconds), what it's doing,
 * or how it ended. "Waiting for a worker" is the job still queued (as the review desk says it).
 */
export function statusLabel(
  steps: LanderStep[],
  state: "starting" | "working" | "done" | "failed",
  seconds: number,
  queued = false,
): string {
  if (state === "failed") return "Stopped";
  if (state === "done") return `Completed ${plural(steps.length, "step")}`;
  const running = steps.find((s) => !s.done);
  if (running) return running.label;
  return queued ? `Waiting for a worker… ${seconds}s` : `Thinking… ${seconds}s`;
}

/** The lines the change rewrote: before and after, in page order. */
export function changedLines(
  before: LanderLine[],
  after: LanderLine[],
  section: string | null,
): { number: number; before: string; after: string }[] {
  const old = new Map(before.map((l) => [l.number, l]));
  return after
    .filter((l) => section === null || l.section === section)
    .flatMap((l) => {
      const was = old.get(l.number);
      return was && was.text !== l.text
        ? [{ number: l.number, before: was.text, after: l.text }]
        : [];
    });
}

/** The closing line once the change is saved. */
export function closingSentence(
  target: LanderTarget,
  rewritten: number,
  kept: number,
  failedChunks: number,
): string {
  const parts = [
    `Done. I rewrote ${plural(rewritten, "line")} in ${targetName(target)}.`,
  ];
  if (kept > 0)
    parts.push(
      `I left the ${kept === 1 ? "line" : `${kept} lines`} you'd edited by hand.`,
    );
  if (failedChunks > 0) parts.push("A few lines kept their words.");
  return parts.join(" ");
}

/** Lines in the target that can change: the ones that shimmer on the page while Lander works. */
export function editableLines(
  paragraphs: DeskParagraph[],
  target: LanderTarget,
): number[] {
  return paragraphs
    .filter((p) => !p.locked && (target === null || p.section === target.key))
    .map((p) => p.number);
}

export type LanderSuggestion = {
  id: string;
  text: string;
  target: LanderTarget;
  icon: "shorten" | "sharpen" | "warm" | "page";
};

/**
 * Starting points for the empty thread, from the page's own sections: only sections with lines
 * Lander can rewrite (a section filled entirely from data would only be refused).
 */
export function suggestions(
  layout: DeskSection[],
  selected: DeskSection | null,
  paragraphs: DeskParagraph[],
): LanderSuggestion[] {
  const out: LanderSuggestion[] = [];
  const as = (s: DeskSection): LanderTarget => ({ key: s.key, label: s.label });
  const writable = (s: DeskSection) =>
    editableLines(paragraphs, as(s)).length > 0;
  if (selected && writable(selected))
    out.push({
      id: "shorten",
      text: `Make ${selected.label} shorter and easier to scan`,
      target: as(selected),
      icon: "shorten",
    });
  const hero = layout.find(
    (s) =>
      /hero|headline/i.test(s.key) && s.key !== selected?.key && writable(s),
  );
  if (hero)
    out.push({
      id: "sharpen",
      text: `Give ${hero.label} a punchier headline`,
      target: as(hero),
      icon: "sharpen",
    });
  const faq = layout.find(
    (s) =>
      /faq|question/i.test(s.key) && s.key !== selected?.key && writable(s),
  );
  if (faq)
    out.push({
      id: "warm",
      text: `Make ${faq.label} warmer and more reassuring`,
      target: as(faq),
      icon: "warm",
    });
  if (editableLines(paragraphs, null).length > 0)
    out.push({
      id: "page",
      text: "Rewrite the page for a first-time buyer",
      target: null,
      icon: "page",
    });
  return out.slice(0, 4);
}
