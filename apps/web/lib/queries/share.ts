"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFetch } from "@/lib/api/client";
import { type ShareAnswer, shareAnswerSchema } from "@/lib/validators/share";

/** The page's client link (B3.6, D119), read again whenever the page's status or version moves
 * (an Approve makes a new approved version; an edit makes the link out of date). */
export function shareKey(buildId: string, status: string, version: number) {
  return ["share", buildId, status, version] as const;
}

export function useShare(buildId: string, status: string, version: number) {
  return useQuery({
    queryKey: shareKey(buildId, status, version),
    queryFn: () => apiFetch(`/api/builds/${buildId}/share`, shareAnswerSchema),
    retry: false,
  });
}

/** Make the link (or get the live one) or turn it off; the answer replaces what's shown. */
export function useShareAction(
  buildId: string,
  status: string,
  version: number,
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (action: "make" | "off") =>
      apiFetch(`/api/builds/${buildId}/share`, shareAnswerSchema, {
        method: action === "make" ? "POST" : "DELETE",
      }),
    onSuccess: (next: ShareAnswer) => {
      client.setQueryData(shareKey(buildId, status, version), next);
    },
  });
}
