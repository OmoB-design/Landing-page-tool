"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";

import { apiFetch } from "@/lib/api/client";
import { POLL_ACTIVE_MS, POLL_IDLE_MS, isActive } from "@/lib/jobs/progress";
import {
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

/** One job with its events: polls every 1.5 s until it finishes, then stops. */
export function useJob(id: string | null) {
  return useQuery({
    queryKey: jobKeys.detail(id ?? ""),
    queryFn: () => apiFetch(`/api/jobs/${id}`, jobDetailSchema),
    enabled: id !== null,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === undefined || isActive(status) ? POLL_ACTIVE_MS : false;
    },
  });
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
