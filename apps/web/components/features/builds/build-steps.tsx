"use client";

import { SkeletonText } from "@/components/app/skeletons";
import { BuildSpinnerIcon, BuildStepIcon } from "@/components/ui/lp-icons";
import { OWNED_BUILD_STEPS } from "@/lib/builds/steps";
import { usePageRefresh } from "@/lib/hooks/use-page-refresh";
import { jobStepStates } from "@/lib/jobs/steps";
import { useJob } from "@/lib/queries/jobs";
import { cn } from "@/lib/utils";
import type { JobDetail } from "@/lib/validators/jobs";

import { CollapsibleSection } from "./panel-section";

export type BuildStep = {
  id: string;
  label: string;
  state: "idle" | "running" | "done" | "failed";
  note?: string;
};

/**
 * The pipeline's steps for this build. A build that hasn't started (queued, or no job yet) shows
 * every step at rest; a running one spins the step it's on; finished steps turn blue. Before the
 * job loads, a finished build shows its steps finished rather than flashing them at rest.
 */
function buildSteps(job: JobDetail | null, finished: boolean): BuildStep[] {
  if (!job) {
    return OWNED_BUILD_STEPS.map((step) => ({
      ...step,
      state: finished ? "done" : "idle",
    }));
  }
  return jobStepStates(OWNED_BUILD_STEPS, job).map((step) => ({
    id: step.id,
    label: step.label,
    state: step.done
      ? "done"
      : step.status === "failed"
        ? "failed"
        : step.status === "running" && job.status === "running"
          ? "running"
          : "idle",
    note: step.note,
  }));
}

/**
 * The build's steps, live while it runs, and its log folded under Details (Figma Build: Stepper,
 * Completion chip, Details). The page re-renders when the job finishes, to show the preview and
 * the report.
 */
export function BuildSteps({
  jobId,
  finished,
}: {
  jobId: string | null;
  /** The build has a report, so its steps are done even before the job loads. */
  finished: boolean;
}) {
  const { data: job } = useJob(jobId);
  usePageRefresh(
    job && (job.status === "succeeded" || job.status === "failed")
      ? job.id
      : null,
  );
  const steps = buildSteps(job ?? null, finished);
  const events =
    job?.events.filter(
      (event) =>
        !(event.level === "error" && event.message === job.error?.message),
    ) ?? [];
  return (
    <>
      <BuildStepsCard
        steps={steps}
        done={steps.filter((step) => step.state === "done").length}
      />
      {events.length > 0 ? <BuildLog messages={events} /> : null}
    </>
  );
}

/**
 * The build's log, folded under Details (Figma Build, Details): Heading-05 lines on Foreground-01,
 * each on a 0.5 px Stroke-Strong rule.
 */
export function BuildLog({
  messages,
}: {
  messages: { id: string | number; message: string }[];
}) {
  return (
    <CollapsibleSection title="Details">
      <ol
        aria-label="Build log"
        className="flex flex-col gap-1 bg-foreground-01 px-1.5 py-1"
      >
        {messages.map((event) => (
          <li
            key={event.id}
            className="py-0.5 text-type-caption-1 font-medium text-heading-05 divider-b-strong"
          >
            {event.message}
          </li>
        ))}
      </ol>
    </CollapsibleSection>
  );
}

/**
 * Build steps (Figma Build, Stepper and Completion chip): a Foreground-01 card with 10 px corners
 * and a 0.7 px Surface/Stroke line; a 36 px Surface-Primary header ("Build steps", 13 px medium
 * Heading-02, and the count chip: 11 px Heading-04 on Foreground-01 in a 0.5 px line, Surface/Stroke
 * while counting and Spot-500-Blue once every step is done); then the steps 2 px apart, the last one
 * on the card's foot (the frame's 4 px below it taken off, owner). `done`
 * null shows the count loading.
 */
export function BuildStepsCard({
  steps,
  done,
}: {
  steps: BuildStep[];
  done: number | null;
}) {
  const complete = done === steps.length;
  return (
    <section
      aria-labelledby="build-steps-title"
      className="stroke-inside-thin flex flex-col gap-0.5 overflow-hidden rounded-lg bg-foreground-01"
    >
      <div className="flex items-center gap-1.5 bg-surface-primary px-2.5 py-2 divider-b-thin">
        <h2
          id="build-steps-title"
          className="min-w-0 flex-1 text-type-body-small leading-5 font-medium text-heading-02"
        >
          Build steps
        </h2>
        {done === null ? (
          <SkeletonText className="text-type-caption-2" width={72} />
        ) : (
          <span
            className={cn(
              "rounded-lg bg-foreground-01 px-1.5 py-0.5 text-type-caption-2 font-medium text-heading-04 tabular-nums ring-half transition-shadow duration-200 ease-out ring-inset",
              complete ? "ring-spot-500-blue" : "ring-stroke",
            )}
          >
            {done}/{steps.length} completed
          </span>
        )}
      </div>
      <ol className="flex flex-col gap-0.5">
        {steps.map((step) => (
          <StepRow key={step.id} step={step} />
        ))}
      </ol>
    </section>
  );
}

const STATE_LABEL: Record<BuildStep["state"], string> = {
  idle: "not started",
  running: "in progress",
  done: "done",
  failed: "failed",
};

/**
 * One step (Figma Build, Stepper): 36 px whatever its state, 8 px in, the 14 px loader and the name
 * 6 px apart. At rest (Default): 12 px medium Heading-06, the loader dimmed to 30 % in Icon-System.
 * In progress (Present): a step card (Surface-Primary, 12 px corners, 0.5 px Surface/Stroke, a soft
 * light above) fades in, the name grows to 13 px, and the spinner (eight spokes fading behind the
 * brightest, the owner's icon) turns smoothly in Icon-Nav-Active (250 ms ease-out; under reduced motion the fades stay and the name changes size
 * without moving). Finished: the
 * card, the name in Heading-04 and the loader still, in Highlight-Blue-500. Failed (Figma
 * Build/Fail): the card, the name at rest (12 px, Heading-06), the loader in red with its dashes at
 * 70 % round a red dot, and the reason underneath in Text-Danger.
 */
function StepRow({ step }: { step: BuildStep }) {
  const started = step.state !== "idle";
  return (
    <li
      aria-current={step.state === "running" ? "step" : undefined}
      className={cn(
        "flex flex-col gap-1 rounded-item p-2 transition-card",
        started && "step-card",
      )}
    >
      <span className="flex items-center gap-1.5">
        {step.state === "running" ? (
          <BuildSpinnerIcon className="size-3.5 shrink-0 animate-step-spin text-icon-nav-active motion-reduce:animate-step-spin-slow" />
        ) : (
          <BuildStepIcon
            state={step.state}
            className={cn(
              "size-3.5 shrink-0 transition-colors duration-250 ease-out",
              step.state === "idle" && "text-icon-system",
              step.state === "done" && "text-highlight-blue-500",
              step.state === "failed" && "text-step-failed",
            )}
            dotClassName={
              step.state === "done"
                ? "fill-surface-primary"
                : step.state === "failed"
                  ? "fill-step-failed-dot"
                  : "fill-foreground-01"
            }
          />
        )}
        <span
          className={cn(
            // Every step is 36 px, at rest or started, so the card keeps its height as a build
            // runs (owner): the name is always set at 13 px on a 20 px line (Figma's 150 %
            // rounded) and drawn at 12 px (scaled from its left edge) until the step starts, then
            // eases up to 13 px; scaling, unlike a font-size change, moves nothing around it.
            "min-w-0 flex-1 origin-left text-type-body-small leading-5 font-medium transition-label motion-reduce:transition-colors",
            // A failed step keeps its name at rest (Figma Build/Fail): 12 px, Heading-06.
            (!started || step.state === "failed") && "scale-92",
            step.state === "done" ? "text-heading-04" : "text-heading-06",
          )}
        >
          {step.label}
          <span className="sr-only"> ({STATE_LABEL[step.state]})</span>
        </span>
      </span>
      {step.state === "failed" && step.note ? (
        <p className="pl-5 text-type-caption-1 font-medium text-text-danger">
          {step.note}
        </p>
      ) : null}
    </li>
  );
}
