/**
 * Lander, the page editor's agent (B3.1b, D105; an agent from B3.1c, D106): its conversation,
 * kept apart from the components so the rules can be tested. A request is a job in which Claude
 * changes the page with tools; the thread tells it as Sidekick's and the reference video's do: a
 * plan sentence, the steps as they happen (from the job's events), a card per change, a closing
 * line, and one Undo for the whole request.
 */
import {
  AGENT_REQUEST_MAX,
  type AgentChange,
  type AgentFeedback,
  type AgentMessage,
  type AgentReply,
  type AgentStep,
  agentEventSchema,
  type AgentDoing,
} from "@/lib/validators/agent";
import type { DeskParagraph, DeskSection } from "@/lib/validators/desk";

/** What a request is about: a section of the page, or the whole page (null). */
export type LanderTarget = { key: string; label: string } | null;

/** A request and what Lander did with it. */
export type LanderTurn = {
  id: string;
  request: string;
  target: LanderTarget;
  startedAt: number;
  /** The request's job, once started; null while starting or when it was refused. */
  jobId: string | null;
  /** Refused before it started (the message says why). */
  refused: string | null;
  /** The saved reply, for a request loaded from the conversation. */
  saved: AgentReply | null;
  /** The pictures sent with it (links or, while sending, the pictures themselves). */
  images: string[];
  /** The rating its reply was given (B3.1e). */
  feedback: AgentFeedback | null;
  /** The request's message, once saved (Restore page to here goes by it). */
  messageId: string | null;
  /** The page as it was when it was sent can still be restored. */
  restorable: boolean;
};

export type TurnState = "starting" | "working" | "done" | "stopped" | "failed";

/** The longest request Lander takes (worker AgentRequest.text). */
export const REQUEST_MAX = AGENT_REQUEST_MAX;

export function targetName(target: LanderTarget): string {
  return target ? target.label : "the page";
}

export function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

/** What a running request's job has said so far: its plan, the steps, the changes, the close,
 * and what it's doing now (its newest "doing" event, once the job sends them). */
export function replyFromEvents(
  events: { data?: Record<string, unknown> | null }[],
): Pick<AgentReply, "plan" | "steps" | "changes" | "closing"> & {
  doing: AgentDoing | null;
} {
  const steps: AgentStep[] = [];
  let plan: string | null = null;
  let closing: string | null = null;
  let doing: AgentDoing | null = null;
  for (const event of events) {
    const parsed = agentEventSchema.safeParse(event.data?.agent);
    if (!parsed.success) continue;
    const e = parsed.data;
    if (e.type === "plan") plan = e.text;
    else if (e.type === "closing") closing = e.text;
    else if (e.type === "doing") doing = { phase: e.phase, text: e.text };
    else
      steps.push({
        label: e.label,
        ok: e.ok,
        change: e.change ?? null,
        image_url: e.image_url ?? null,
        detail: e.detail ?? null,
      });
  }
  const changes = steps.flatMap((s) => (s.change ? [s.change] : []));
  return { plan, steps, changes, closing, doing };
}

/** The status line over a reply. */
export function statusLabel(
  state: TurnState,
  steps: AgentStep[],
  seconds: number,
  queued = false,
  took: number | null = null,
  doing: AgentDoing | null = null,
): string {
  const time = took ? ` · ${took}s` : "";
  if (state === "failed") return `Couldn’t finish${time}`;
  if (state === "stopped")
    return `Stopped after ${plural(steps.length, "step")}${time}`;
  if (state === "done")
    return `Completed ${plural(steps.length, "step")}${time}`;
  if (queued) return `Waiting for a worker… ${seconds}s`;
  // The phase Lander is in, as Claude's chat names it (owner, 2026-11-05): "Thinking… 5s" while it
  // decides, then "Styling…", "Writing…", "Checking…" while it works.
  if (doing)
    return doing.phase === "Thinking"
      ? `Thinking… ${seconds}s`
      : `${doing.phase}…`;
  return `Working on it… ${seconds}s`;
}

/** Every line a request's changes rewrote, by number on the page it saved. */
export function changedLineNumbers(changes: AgentChange[]): number[] {
  return [
    ...new Set(
      changes.flatMap((c) =>
        c.kind === "lines" ? c.lines.map((l) => l.number) : [],
      ),
    ),
  ];
}

/**
 * A saved conversation as turns: each request with its reply (by job). A request with no reply
 * is the running one when its job is the page's job now, otherwise one that never finished.
 */
export function turnsFromThread(
  messages: AgentMessage[],
  runningJobId: string | null,
): LanderTurn[] {
  const replies = new Map<string, AgentReply>();
  const ratings = new Map<string, AgentFeedback>();
  for (const m of messages)
    if (m.role === "assistant" && m.job_id) {
      replies.set(m.job_id, m.content);
      if (m.feedback) ratings.set(m.job_id, m.feedback);
    }
  return messages.flatMap((m): LanderTurn[] => {
    if (m.role !== "user") return [];
    const reply = m.job_id ? replies.get(m.job_id) : undefined;
    const running = m.job_id !== null && m.job_id === runningJobId;
    return [
      {
        id: m.id,
        messageId: m.id,
        restorable: m.content.restorable ?? true,
        request: m.content.text,
        target: m.content.target,
        startedAt: Date.parse(m.created_at),
        jobId: m.job_id,
        refused: null,
        feedback: (m.job_id && ratings.get(m.job_id)) || null,
        images: (m.content.image_urls ?? []).filter(
          (url): url is string => typeof url === "string",
        ),
        saved:
          reply ??
          (running
            ? null
            : {
                state: "failed",
                steps: [],
                changes: [],
                error: "This request didn’t finish.",
              }),
      },
    ];
  });
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
