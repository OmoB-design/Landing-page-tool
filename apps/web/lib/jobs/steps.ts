import {
  type JobDetail,
  type JobFound,
  jobFoundSchema,
} from "@/lib/validators/jobs";

export type StepDefinition = { id: string; label: string };

export type JobStepState = {
  id: string;
  label: string;
  done: boolean;
  status?: "running" | "failed";
  note?: string;
  /** What the step found (I3), from its progress event's `data.found`. */
  found?: JobFound;
};

/**
 * A job's named steps from its progress events: the worker reports `data.step` (1-based) as
 * each step finishes. Finished steps are done; while the job is queued or running the next
 * step is "running"; a failed job marks the step it was on as failed, with the error. A finished
 * step carries what it found when its event reports `data.found` (I3).
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
  const found = foundByStep(job.events);
  return steps.map((step, index) => {
    if (index < finished) {
      const what = found.get(index + 1);
      return what
        ? { ...step, done: true, found: what }
        : { ...step, done: true };
    }
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

/** Each step's `data.found`, by its 1-based number; a later report for a step wins. */
function foundByStep(events: JobDetail["events"]): Map<number, JobFound> {
  const found = new Map<number, JobFound>();
  for (const event of events) {
    const step = event.data?.step;
    if (typeof step !== "number" || event.data?.found == null) continue;
    const parsed = jobFoundSchema.safeParse(event.data.found);
    if (parsed.success) found.set(step, parsed.data);
  }
  return found;
}
