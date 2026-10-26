"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFetch } from "@/lib/api/client";
import {
  type IntegrationsState,
  integrationsStateSchema,
} from "@/lib/validators/publishing";

const KEY = ["integrations"] as const;

/** The org's connections and testing switch, from the server's copy (refetched after changes).
 * `sample` (the states page) keeps a sample's data to itself and never fetches. */
export function useIntegrations(initial: IntegrationsState, sample?: string) {
  return useQuery({
    queryKey: sample ? [...KEY, "sample", sample] : KEY,
    queryFn: () => apiFetch("/api/integrations", integrationsStateSchema),
    enabled: !sample,
    initialData: initial,
    // The server's copy is fresh; "static" also keeps React Query from reading the clock while
    // the page prerenders.
    initialDataUpdatedAt: 0,
    staleTime: "static",
  });
}

/** Puts a change's answer (the new state) in place. */
export function useSetIntegrations() {
  const client = useQueryClient();
  return (next: IntegrationsState) => client.setQueryData(KEY, next);
}
