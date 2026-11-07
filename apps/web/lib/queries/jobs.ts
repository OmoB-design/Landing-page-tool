"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useEffectEvent, useRef } from "react";
import { z } from "zod";

import { apiFetch } from "@/lib/api/client";
import {
  POLL_ACTIVE_MS,
  POLL_FAST_MS,
  POLL_IDLE_MS,
  isActive,
} from "@/lib/jobs/progress";
import {
  type JobDetail,
  type StartJobInput,
  enqueueResponseSchema,
  jobDetailSchema,
  jobListSchema,
} from "@/lib/validators/jobs";

export const jobKeys = {
  all: ["jobs"] as const,
  detail: (id: string) => ["jobs", id] as const,
};

/** Recent jobs in the current org: polls every 1.5 s while any is active, every 15 s otherwise
 * (paused while the tab is hidden). */
export function useJobs() {
  return useQuery({
    queryKey: jobKeys.all,
    queryFn: () => apiFetch("/api/jobs", jobListSchema),
    refetchInterval: (query) =>
      query.state.data?.jobs.some((job) => isActive(job.status))
        ? POLL_ACTIVE_MS
        : POLL_IDLE_MS,
  });
}

/** One job with its events: polls every 1.5 s (0.5 s when `fast`) until it finishes, then
 * stops. */
export function useJob(id: string | null, fast = false) {
  return useQuery({
    queryKey: jobKeys.detail(id ?? ""),
    queryFn: () => apiFetch(`/api/jobs/${id}`, jobDetailSchema),
    enabled: id !== null,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status !== undefined && !isActive(status)) return false;
      return fast ? POLL_FAST_MS : POLL_ACTIVE_MS;
    },
  });
}

/** What a screen does when the job it started ends: each runs once per job. */
export type JobOutcomes = {
  succeeded?: (job: JobDetail) => void;
  failed?: (job: JobDetail) => void;
  cancelled?: (job: JobDetail) => void;
};

/**
 * Follows the job a screen started, by its own id (B5.4, D128): the job while it runs, whether
 * it's still running (true from the moment there is an id, before the first poll lands), why it
 * failed, and one call of `on.succeeded`, `on.failed` or `on.cancelled` when it ends. A job seen
 * already finished (a fast one, or one found on load) still gets its call, once.
 */
export function useFollowedJob(
  id: string | null,
  on: JobOutcomes = {},
  fast = false,
) {
  const query = useJob(id, fast);
  const job = id !== null && query.data?.id === id ? query.data : undefined;
  const handled = useRef<string | null>(null);
  const settle = useEffectEvent((ended: JobDetail) => {
    if (ended.status === "succeeded") on.succeeded?.(ended);
    else if (ended.status === "failed") on.failed?.(ended);
    else if (ended.status === "cancelled") on.cancelled?.(ended);
  });
  useEffect(() => {
    if (!job || isActive(job.status) || handled.current === job.id) return;
    handled.current = job.id;
    settle(job);
  }, [job]);
  return {
    job,
    running: id !== null && (!job || isActive(job.status)),
    failure:
      job?.status === "failed"
        ? (job.error?.message ?? "It didn’t finish.")
        : null,
    cancelled: job?.status === "cancelled",
  };
}

/** Jobs → Mark all as read: finished jobs stop counting as unread, straight away. */
export function useMarkJobsSeen() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch("/api/jobs/seen", z.object({ ok: z.boolean() }), {
        method: "POST",
      }),
    onMutate: () => {
      const seenAt = new Date().toISOString();
      queryClient.setQueryData<z.infer<typeof jobListSchema>>(
        jobKeys.all,
        (current) => (current ? { ...current, seenAt } : current),
      );
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: jobKeys.all }),
  });
}

export function useStartJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: StartJobInput) =>
      apiFetch("/api/jobs", enqueueResponseSchema, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: jobKeys.all }),
  });
}
