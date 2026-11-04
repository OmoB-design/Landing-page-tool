"use client";

import { useCallback, useState } from "react";

import { toast } from "@/components/app/toaster";
import {
  type LanderLine,
  type LanderStep,
  type LanderTarget,
  type LanderTurn,
  changedLines,
  closingSentence,
  editableLines,
  stepsFrom,
  targetName,
} from "@/lib/pages/lander";

import { type SettledRedraft, useDesk } from "../../builds/desk-context";

export type TurnState = "starting" | "working" | "done" | "failed";

/** What the thread shows for a turn, worked out from the desk on every render. */
export type TurnView = {
  turn: LanderTurn;
  state: TurnState;
  steps: LanderStep[];
  lines: { number: number; before: string; after: string }[];
  closing: string | null;
  error: string | null;
  /** The desk change it saved ("Redrafted Hero") and the page version after it. */
  reason: string | null;
  versionAfter: number | null;
  /** Seconds it took, once it finished. */
  took: number | null;
  /** Its job is still waiting for a worker to claim it. */
  queued: boolean;
};

function number(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function viewOf(
  turn: LanderTurn,
  settled: SettledRedraft | undefined,
  live: { status: string; events: { message: string }[] } | null,
): TurnView {
  const base = {
    turn,
    lines: [],
    closing: null,
    error: null,
    reason: null,
    versionAfter: null,
    took: null,
    queued: false,
  };
  if (turn.refused) {
    return { ...base, state: "failed", steps: [], error: turn.refused };
  }
  if (settled) {
    const job = settled.job;
    const steps = stepsFrom(job.events, turn.target, turn.editable, true);
    const took =
      job.started_at && job.finished_at
        ? Math.max(
            1,
            Math.round(
              (Date.parse(job.finished_at) - Date.parse(job.started_at)) / 1000,
            ),
          )
        : null;
    if (job.status !== "succeeded") {
      return {
        ...base,
        state: "failed",
        steps,
        took,
        error: job.error?.message ?? "Lander couldn't finish that.",
      };
    }
    const result = job.result ?? {};
    const after: LanderLine[] = settled.paragraphs ?? [];
    return {
      ...base,
      state: "done",
      steps,
      took,
      lines: changedLines(turn.before, after, turn.target?.key ?? null),
      closing: closingSentence(
        turn.target,
        number(result.rewritten),
        number(result.kept_edited),
        number(result.failed_chunks),
      ),
      reason: typeof result.reason === "string" ? result.reason : null,
      versionAfter:
        typeof result.page_version === "number"
          ? result.page_version
          : settled.pageVersion,
    };
  }
  if (!turn.jobId)
    return {
      ...base,
      state: "starting",
      steps: stepsFrom([], turn.target, turn.editable, false),
    };
  return {
    ...base,
    state: "working",
    queued: live?.status === "queued",
    steps: stepsFrom(live?.events ?? [], turn.target, turn.editable, false),
  };
}

/**
 * Lander's conversation for this page (B3.1b, D105), kept for the visit (B3.1c saves it). A request
 * becomes a redraft of its target (a section, or the page) with the request as the note; its job's
 * progress becomes the steps, and when it ends the change and the closing line follow. One request
 * at a time: the desk runs one redraft per page.
 */
export function useLander(settle: () => Promise<void>) {
  const { desk, startRedraft, settledRedrafts, redrafting } = useDesk();
  const [turns, setTurns] = useState<LanderTurn[]>([]);

  const liveJob = redrafting?.job;
  const live =
    redrafting && redrafting.redraft.job_id
      ? {
          id: redrafting.redraft.job_id,
          status: liveJob?.status ?? redrafting.redraft.status,
          events: liveJob?.events ?? [],
        }
      : null;
  const views = turns.map((turn) =>
    viewOf(
      turn,
      turn.jobId ? settledRedrafts[turn.jobId] : undefined,
      live && live.id === turn.jobId ? live : null,
    ),
  );
  const active = views.find(
    (v) => v.state === "starting" || v.state === "working",
  );
  const working = Boolean(active) || desk.redraft !== null;

  const send = useCallback(
    async (request: string, target: LanderTarget) => {
      if (working) {
        toast("Lander is still on the last request.");
        return;
      }
      await settle();
      const id = crypto.randomUUID();
      const editable = editableLines(desk.paragraphs, target).length;
      const turn: LanderTurn = {
        id,
        request: request.trim(),
        target,
        startedAt: Date.now(),
        jobId: null,
        refused:
          editable === 0
            ? `There's nothing to rewrite in ${targetName(target)}: its lines come from your brand or product.`
            : null,
        before: desk.paragraphs.map(({ number, text, section }) => ({
          number,
          text,
          section,
        })),
        editable,
      };
      setTurns((all) => [...all, turn]);
      if (turn.refused) return;
      const jobId = await startRedraft({
        scope: target ? "section" : "page",
        section: target?.key,
        note: turn.request || undefined,
      });
      setTurns((all) =>
        all.map((t) =>
          t.id === id
            ? {
                ...t,
                jobId,
                refused: jobId
                  ? null
                  : "Lander couldn't start that. Try again in a moment.",
              }
            : t,
        ),
      );
    },
    [desk.paragraphs, settle, startRedraft, working],
  );

  const reset = useCallback(() => setTurns([]), []);

  return {
    views,
    working,
    /** The lines of the request being worked on: they shimmer on the page. */
    busyLines: active ? editableLines(desk.paragraphs, active.turn.target) : [],
    send,
    reset,
  };
}
