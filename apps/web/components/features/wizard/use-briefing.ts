"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { useJob, useStartJob } from "@/lib/queries/jobs";
import { loadBriefing } from "@/lib/wizard/actions";

export type BriefingStatus =
  "none" | "loading" | "writing" | "ready" | "failed";

/**
 * A product's briefing for the wizard. When the product has none yet, the product_briefing job
 * starts straight away (once per product per visit), so it's usually ready by the Audience step.
 */
export function useBriefing(productId: string | null) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["briefing", productId],
    queryFn: () => loadBriefing(productId ?? ""),
    enabled: productId !== null,
    staleTime: 60_000,
  });
  const startJob = useStartJob();
  const [jobs, setJobs] = useState<Record<string, string>>({});
  const started = useRef(new Set<string>());
  const jobId = productId ? (jobs[productId] ?? null) : null;
  const { data: job } = useJob(jobId);
  const { mutate } = startJob;

  const write = (id: string) => {
    started.current.add(id);
    mutate(
      { kind: "product_briefing", payload: { product_id: id } },
      {
        onSuccess: ({ job: queued }) =>
          setJobs((current) => ({ ...current, [id]: queued.id })),
      },
    );
  };

  const missing = productId !== null && query.data?.briefing === null;
  useEffect(() => {
    if (missing && productId && !started.current.has(productId))
      write(productId);
    // `write` only changes identity, not behaviour.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missing, productId]);

  useEffect(() => {
    if (job?.status === "succeeded")
      void queryClient.invalidateQueries({ queryKey: ["briefing", productId] });
  }, [job?.status, productId, queryClient]);

  const status: BriefingStatus =
    productId === null
      ? "none"
      : query.data?.briefing
        ? "ready"
        : query.isError ||
            startJob.isError ||
            job?.status === "failed" ||
            job?.status === "cancelled"
          ? "failed"
          : query.isPending
            ? "loading"
            : "writing";

  return {
    briefing: query.data?.briefing ?? null,
    status,
    job: job ?? null,
    error:
      startJob.error?.message ??
      job?.error?.message ??
      (query.error ? "Couldn't load the briefing." : null),
    retry: () => (productId ? write(productId) : undefined),
  };
}
