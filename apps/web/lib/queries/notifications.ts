"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";

import { apiFetch } from "@/lib/api/client";
import { notificationListSchema } from "@/lib/validators/jobs";

export const notificationKeys = { all: ["notifications"] as const };

/** The user's notifications; refreshed every 30 s and whenever a job finishes (JobTray). */
export function useNotifications() {
  return useQuery({
    queryKey: notificationKeys.all,
    queryFn: () => apiFetch("/api/notifications", notificationListSchema),
    refetchInterval: 30_000,
  });
}

/** Marks the given notifications (or all) read, updating the list straight away. */
export function useMarkNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids?: string[]) =>
      apiFetch("/api/notifications/read", z.object({ ok: z.boolean() }), {
        method: "POST",
        body: JSON.stringify(ids ? { ids } : {}),
      }),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: notificationKeys.all }),
  });
}
