"use client";

import { JobSteps } from "@/components/app/job-steps";
import { OWNED_BUILD_STEPS } from "@/lib/builds/steps";
import { usePageRefresh } from "@/lib/hooks/use-page-refresh";
import { useJob } from "@/lib/queries/jobs";

/** The build's pipeline steps, live while it runs; the page re-renders when it finishes. */
export function BuildProgress({ jobId }: { jobId: string | null }) {
  const { data: job } = useJob(jobId);
  usePageRefresh(
    job && (job.status === "succeeded" || job.status === "failed")
      ? job.id
      : null,
  );
  if (!jobId) return null;
  return (
    <JobSteps title="Build steps" steps={OWNED_BUILD_STEPS} job={job ?? null} />
  );
}
