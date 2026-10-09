import type { JobDetail } from "@/lib/validators/jobs";

export type StepDefinition = { id: string; label: string };

export type JobStepState = {
  id: string;
  label: string;
  done: boolean;
  status?: "running" | "failed";
  note?: string;
};

/**
 * A job's named steps from its progress events: the worker reports `data.step` (1-based) as
 * each step finishes. Finished steps are done; while the job is queued or running the next
 * step is "running"; a failed job marks the step it was on as failed, with the error.
 */
export function jobStepStates(
  steps: StepDefinition[],
  job: Pick<JobDetail, "status" | "events" | "error"> | null,
): JobStepState[] {
  if (!job) return steps.map((step) => ({ ...step, done: false }));
  const finished =
    job.status === "succeeded"
      ? steps.length
      : Math.min(
          steps.length,
          Math.max(
            0,
            ...job.events.map((event) =>
              typeof event.data?.step === "number" ? event.data.step : 0,
            ),
          ),
        );
  return steps.map((step, index) => {
    if (index < finished) return { ...step, done: true };
    if (index === finished) {
      if (job.status === "queued" || job.status === "running") {
        return { ...step, done: false, status: "running" };
      }
      if (job.status === "failed") {
        return {
          ...step,
          done: false,
          status: "failed",
          note: job.error?.message,
        };
      }
    }
    return { ...step, done: false };
  });
}
