"use client";

import { ProgressTracker } from "@/components/ui/progress-tracker";
import { type StepDefinition, jobStepStates } from "@/lib/jobs/steps";
import type { JobDetail } from "@/lib/validators/jobs";

/**
 * A job's progress as a checklist (AffectUI progress tracker): finished steps are ticked and
 * struck through, the current one spins with a shimmering label, a failed one shows a cross and
 * the reason. The raw progress log is folded under "Details". The build progress screen (B1.2)
 * uses the same pattern for pipeline steps.
 */
export function JobSteps({
  title,
  steps,
  job,
  hideErrorInLog = true,
}: {
  title: string;
  steps: StepDefinition[];
  job: JobDetail | null;
  hideErrorInLog?: boolean;
}) {
  const events =
    job?.events.filter(
      (event) =>
        !(
          hideErrorInLog &&
          event.level === "error" &&
          event.message === job.error?.message
        ),
    ) ?? [];
  return (
    <div className="flex flex-col gap-2">
      <ProgressTracker
        title={title}
        readOnly
        steps={jobStepStates(steps, job)}
      />
      {events.length > 0 ? (
        <details className="group max-w-xl text-sm text-fg-muted">
          <summary className="w-fit cursor-pointer rounded-xs px-1 hover:text-fg">
            Details
          </summary>
          <ol
            aria-label="Progress log"
            className="mt-1 flex flex-col gap-0.5 pl-1"
          >
            {events.map((event) => (
              <li key={event.id}>{event.message}</li>
            ))}
          </ol>
        </details>
      ) : null}
    </div>
  );
}
