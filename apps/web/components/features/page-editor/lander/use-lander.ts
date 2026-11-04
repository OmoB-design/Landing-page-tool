"use client";

import { useCallback, useEffect, useState } from "react";

import { toast } from "@/components/app/toaster";
import { apiFetch } from "@/lib/api/client";
import {
  type LanderTarget,
  type LanderTurn,
  type TurnState,
  editableLines,
  replyFromEvents,
  turnsFromThread,
} from "@/lib/pages/lander";
import {
  type AgentChange,
  type AgentStep,
  agentReplySchema,
  agentThreadSchema,
} from "@/lib/validators/agent";
import type { JobDetail } from "@/lib/validators/jobs";

import { type SettledRedraft, useDesk } from "../../builds/desk-context";

/** What the thread shows for a turn, worked out from the desk and its job on every render. */
export type TurnView = {
  turn: LanderTurn;
  state: TurnState;
  /** Its job is still waiting for a worker to claim it. */
  queued: boolean;
  plan: string | null;
  steps: AgentStep[];
  changes: AgentChange[];
  closing: string | null;
  error: string | null;
  /** The desk change it saved ("Lander: rewrote 3 lines in Hero") and the page version after. */
  reason: string | null;
  versionAfter: number | null;
  /** Seconds it took, once it finished. */
  took: number | null;
};

function tookOf(job: JobDetail): number | null {
  if (!job.started_at || !job.finished_at) return null;
  const ms = Date.parse(job.finished_at) - Date.parse(job.started_at);
  return Math.max(1, Math.round(ms / 1000));
}

function viewOf(
  turn: LanderTurn,
  settled: SettledRedraft | undefined,
  live: JobDetail | null,
): TurnView {
  const base: TurnView = {
    turn,
    state: "working",
    queued: false,
    plan: null,
    steps: [],
    changes: [],
    closing: null,
    error: null,
    reason: null,
    versionAfter: null,
    took: null,
  };
  if (turn.refused) return { ...base, state: "failed", error: turn.refused };
  if (settled) {
    const job = settled.job;
    const result = agentReplySchema.safeParse(job.result);
    if (job.status === "succeeded" && result.success) {
      const reply = result.data;
      return {
        ...base,
        state: reply.state === "stopped" ? "stopped" : "done",
        plan: reply.plan ?? null,
        steps: reply.steps,
        changes: reply.changes,
        closing: reply.closing ?? null,
        reason: reply.reason ?? null,
        versionAfter: reply.page_version ?? settled.pageVersion,
        took: tookOf(job),
      };
    }
    const sofar = replyFromEvents(job.events);
    return {
      ...base,
      state: "failed",
      plan: sofar.plan ?? null,
      steps: sofar.steps,
      error: job.error?.message ?? "Lander couldn’t finish that.",
      took: tookOf(job),
    };
  }
  if (turn.saved) {
    const reply = turn.saved;
    return {
      ...base,
      state: reply.state === "working" ? "failed" : reply.state,
      plan: reply.plan ?? null,
      steps: reply.steps,
      changes: reply.changes,
      closing: reply.closing ?? null,
      error: reply.error ?? null,
      reason: reply.reason ?? null,
      versionAfter: reply.page_version ?? null,
      took: reply.took ?? null,
    };
  }
  if (!turn.jobId) return { ...base, state: "starting" };
  if (!live) return base;
  const sofar = replyFromEvents(live.events);
  return {
    ...base,
    queued: live.status === "queued",
    plan: sofar.plan ?? null,
    steps: sofar.steps,
    changes: sofar.changes,
    closing: sofar.closing ?? null,
  };
}

/**
 * Lander's conversation for this page (B3.1c, D106): the newest conversation loads when the editor
 * opens; a request goes to the agent (the page's job, one at a time), its job's events become the
 * plan, steps and change cards as they happen, and its result the reply. New chat starts a new
 * conversation; Stop asks the running request to stop.
 */
export function useLander(buildId: string, settle: () => Promise<void>) {
  const { desk, startAgent, stopAgent, settledRedrafts, redrafting } =
    useDesk();
  const [turns, setTurns] = useState<LanderTurn[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [stopping, setStopping] = useState<string | null>(null);

  // The newest conversation, once, when the editor opens.
  const runningJob =
    desk.redraft?.scope === "agent" ? desk.redraft.job_id : null;
  const [firstRunning] = useState(runningJob);
  useEffect(() => {
    let cancelled = false;
    apiFetch(`/api/builds/${buildId}/agent`, agentThreadSchema)
      .then((thread) => {
        if (cancelled) return;
        setThreadId(thread.thread_id);
        setTurns((now) =>
          now.length ? now : turnsFromThread(thread.messages, firstRunning),
        );
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoaded(true));
    return () => {
      cancelled = true;
    };
  }, [buildId, firstRunning]);

  const liveJob = redrafting?.job ?? null;
  const views = turns.map((turn) =>
    viewOf(
      turn,
      turn.jobId ? settledRedrafts[turn.jobId] : undefined,
      liveJob && liveJob.id === turn.jobId ? liveJob : null,
    ),
  );
  const active = views.find(
    (v) => v.state === "starting" || v.state === "working",
  );
  const working = Boolean(active) || desk.redraft !== null;

  const send = useCallback(
    async (request: string, target: LanderTarget, images: string[] = []) => {
      if (working) {
        toast("Lander is still on the last request.");
        return;
      }
      await settle();
      const id = crypto.randomUUID();
      const turn: LanderTurn = {
        id,
        request: request.trim(),
        target,
        startedAt: Date.now(),
        jobId: null,
        refused: null,
        saved: null,
        images,
      };
      setTurns((all) => [...all, turn]);
      const started = await startAgent({
        text: turn.request,
        target_key: target?.key ?? null,
        thread_id: threadId,
        images,
      });
      if (started) setThreadId(started.thread_id);
      setTurns((all) =>
        all.map((t) =>
          t.id === id
            ? started
              ? { ...t, jobId: started.job_id }
              : { ...t, refused: "Lander couldn’t start that." }
            : t,
        ),
      );
    },
    [settle, startAgent, threadId, working],
  );

  const stop = useCallback(async () => {
    const job = desk.redraft?.scope === "agent" ? desk.redraft.job_id : null;
    if (!job) return;
    setStopping(job);
    await stopAgent();
  }, [desk.redraft, stopAgent]);

  const reset = useCallback(() => {
    setTurns([]);
    setThreadId(null);
  }, []);

  return {
    views,
    working,
    loaded,
    /** Stop was pressed on the request running now. */
    stopping: stopping !== null && stopping === desk.redraft?.job_id,
    /** The lines of the request being worked on: they breathe on the page. */
    busyLines: active ? editableLines(desk.paragraphs, active.turn.target) : [],
    send,
    stop,
    reset,
  };
}
