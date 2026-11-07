"use client";

import { useCallback, useEffect, useState } from "react";
import { z } from "zod";

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
  type AgentDoing,
  type AgentFeedback,
  type AgentStep,
  type AgentThreadSummary,
  agentReplySchema,
  agentThreadSchema,
  agentThreadsSchema,
} from "@/lib/validators/agent";
import { isActive } from "@/lib/jobs/progress";
import { useJob } from "@/lib/queries/jobs";
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
  /** The rating given to the reply (B3.1e). */
  feedback: AgentFeedback | null;
  /** What it's doing now, while it runs ("Styling the box around line 6 in Hero…"). */
  doing: AgentDoing | null;
  /** It ran out of the request's budget: Keep going carries on (B3.1f). */
  more: boolean;
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
    feedback: turn.feedback,
    doing: null,
    more: false,
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
        more: reply.more ?? false,
      };
    }
    const sofar = replyFromEvents(job.events);
    return {
      ...base,
      state: "failed",
      plan: sofar.plan ?? null,
      steps: sofar.steps,
      error: job.error?.message ?? "Buddy couldn’t finish that.",
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
      more: reply.more ?? false,
    };
  }
  if (!turn.jobId) return { ...base, state: "starting" };
  if (!live) return base;
  const sofar = replyFromEvents(live.events);
  return {
    ...base,
    queued: live.status === "queued",
    doing: live.status === "queued" ? null : sofar.doing,
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

  // The newest request still waiting for its result also follows its own job (B5.2, D126). The
  // desk follows the page's running job and settles it when it ends, but if another change
  // refreshed the desk first (the page no longer names a running job), that settling never comes
  // and the turn would show "working" for ever, refusing every request after it. Then the
  // thread settles the turn from its job.
  const waiting = [...turns]
    .reverse()
    .find(
      (t) =>
        t.jobId !== null &&
        !t.saved &&
        !t.refused &&
        settledRedrafts[t.jobId] === undefined,
    );
  const ownJob = useJob(waiting?.jobId ?? null, true);
  const [ownSettled, setOwnSettled] = useState<Record<string, SettledRedraft>>(
    {},
  );
  const ownFinished =
    ownJob.data && !isActive(ownJob.data.status) ? ownJob.data : null;
  if (
    ownFinished &&
    desk.redraft?.job_id !== ownFinished.id &&
    settledRedrafts[ownFinished.id] === undefined &&
    ownSettled[ownFinished.id] === undefined
  ) {
    setOwnSettled((all) => ({
      ...all,
      [ownFinished.id]: {
        job: ownFinished,
        paragraphs: null,
        pageVersion: desk.build.page_version,
      },
    }));
  }

  const liveJob = redrafting?.job ?? null;
  const views = turns.map((turn) =>
    viewOf(
      turn,
      turn.jobId
        ? (settledRedrafts[turn.jobId] ?? ownSettled[turn.jobId])
        : undefined,
      liveJob && liveJob.id === turn.jobId
        ? liveJob
        : ownJob.data && ownJob.data.id === turn.jobId
          ? ownJob.data
          : null,
    ),
  );
  const active = views.find(
    (v) => v.state === "starting" || v.state === "working",
  );
  const working = Boolean(active) || desk.redraft !== null;

  const send = useCallback(
    async (request: string, target: LanderTarget, images: string[] = []) => {
      if (working) {
        toast("Buddy is still on the last request.");
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
        feedback: null,
        messageId: null,
        restorable: false,
      };
      setTurns((all) => [...all, turn]);
      const started = await startAgent({
        text: turn.request,
        target_key: target?.key ?? null,
        target_part: target?.part ?? null,
        thread_id: threadId,
        images,
      });
      if (started) setThreadId(started.thread_id);
      setTurns((all) =>
        all.map((t) =>
          t.id === id
            ? started
              ? {
                  ...t,
                  jobId: started.job_id,
                  messageId: started.message_id,
                  restorable: true,
                }
              : { ...t, refused: "Buddy couldn’t start that." }
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

  // Recents (B3.1e): the page's conversations, and opening one to read and continue.
  const listThreads = useCallback(
    async (): Promise<AgentThreadSummary[]> =>
      (
        await apiFetch(
          `/api/builds/${buildId}/agent/threads`,
          agentThreadsSchema,
        )
      ).threads,
    [buildId],
  );
  const openThread = useCallback(
    async (id: string) => {
      try {
        const thread = await apiFetch(
          `/api/builds/${buildId}/agent?thread=${encodeURIComponent(id)}`,
          agentThreadSchema,
        );
        setThreadId(thread.thread_id);
        setTurns(turnsFromThread(thread.messages, null));
      } catch {
        toast.error("Couldn’t open that conversation.");
      }
    },
    [buildId],
  );

  // A rating shows at once and is put back if it couldn't be saved.
  const rate = useCallback(
    async (jobId: string, feedback: AgentFeedback | null) => {
      const before = turns.find((t) => t.jobId === jobId)?.feedback ?? null;
      const set = (value: AgentFeedback | null) =>
        setTurns((all) =>
          all.map((t) => (t.jobId === jobId ? { ...t, feedback: value } : t)),
        );
      set(feedback);
      try {
        await apiFetch(
          `/api/builds/${buildId}/agent/feedback`,
          z.object({ saved: z.boolean() }),
          {
            method: "POST",
            body: JSON.stringify({
              job_id: jobId,
              rating: feedback?.rating ?? null,
              reasons: feedback?.reasons ?? [],
              note: feedback?.note ?? null,
            }),
          },
        );
      } catch {
        set(before);
        toast.error("Couldn’t save the rating.");
      }
    },
    [buildId, turns],
  );

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
    threadId,
    listThreads,
    openThread,
    rate,
  };
}
