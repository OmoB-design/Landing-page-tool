"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useId, useState } from "react";

import { SkeletonText } from "@/components/app/skeletons";
import {
  BuildSpinnerIcon,
  BuildStepIcon,
  ChevronDownFigmaIcon,
} from "@/components/ui/lp-icons";
import { MorphText } from "@/components/ui/text-morph";
import { buildStepsFor } from "@/lib/builds/steps";
import type { StepDefinition } from "@/lib/jobs/steps";
import { usePageRefresh } from "@/lib/hooks/use-page-refresh";
import { jobStepStates } from "@/lib/jobs/steps";
import { useJob } from "@/lib/queries/jobs";
import { cn } from "@/lib/utils";
import type { JobDetail } from "@/lib/validators/jobs";

import { BuildFigure } from "./build-figure";
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
function buildSteps(
  job: JobDetail | null,
  finished: boolean,
  definitions: StepDefinition[],
): BuildStep[] {
  if (!job) {
    return definitions.map((step) => ({
      ...step,
      state: finished ? "done" : "idle",
    }));
  }
  return jobStepStates(definitions, job).map((step) => ({
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

/** A build's steps from its job, live while it runs, and how many are done (BuildSteps; a batch's
 * frames and rows, B3.5b). */
export function useBuildSteps(
  jobId: string | null,
  finished: boolean,
  origin = "owned",
  templateType: string | null = null,
): { steps: BuildStep[]; done: number; job: JobDetail | null } {
  const { data: job } = useJob(jobId);
  const steps = buildSteps(
    job ?? null,
    finished,
    buildStepsFor(origin, templateType),
  );
  return {
    steps,
    done: steps.filter((step) => step.state === "done").length,
    job: job ?? null,
  };
}

/**
 * The build's steps, live while it runs, and its log folded under Details (Figma Build: Stepper,
 * Completion chip, Details). The page re-renders when the job finishes, to show the preview and
 * the report.
 */
export function BuildSteps({
  jobId,
  finished,
  origin = "owned",
  templateType = null,
  status = "needs_review",
}: {
  jobId: string | null;
  /** The build has a report, so its steps are done even before the job loads. */
  finished: boolean;
  /** A cloned build has the clone-only steps too (B2.3). */
  origin?: string;
  /** A Top 5 ranking build reads its competitors too (B2.4a). */
  templateType?: string | null;
  /** The build's status, for the finished frame's footer ("Ready to review", B3.5d). */
  status?: string;
}) {
  const { data: job } = useJob(jobId);
  usePageRefresh(
    job && (job.status === "succeeded" || job.status === "failed")
      ? job.id
      : null,
  );
  const steps = buildSteps(
    job ?? null,
    finished,
    buildStepsFor(origin, templateType),
  );
  const events =
    job?.events.filter(
      (event) =>
        !(event.level === "error" && event.message === job.error?.message),
    ) ?? [];
  const done = steps.filter((step) => step.state === "done").length;
  const failedStep = steps.find((step) => step.state === "failed");
  const failed = job?.status === "failed" || Boolean(failedStep);
  const running = steps.some((step) => step.state === "running");
  const current =
    steps.find((step) => step.state === "running") ??
    steps.find((step) => step.state === "idle");
  return (
    <>
      {/* While it builds, the steps as a list (the preview has the illustration); once the page
          is built (the preview shows it) or the build failed, the frame the batch panel draws
          (B3.5d, D140): the illustration settles into the card as the list folds away. */}
      <StepsFrame
        title="Build steps"
        steps={steps}
        done={done}
        folded={finished || failed}
        defaultOpen={failed}
        state={failed ? "failed" : finished ? "done" : "building"}
        status={
          failed
            ? failedStep
              ? `Failed · ${failedStep.label}`
              : "Failed"
            : finished
              ? (SETTLED[status] ?? "Built")
              : (current?.label ?? "Starting")
        }
        progress={
          finished
            ? 1
            : steps.length
              ? (done + (running ? 0.5 : 0)) / steps.length
              : 0
        }
      />
      {events.length > 0 ? <BuildLog messages={events} /> : null}
    </>
  );
}

/** What a finished frame's footer says: the page's status, as the Pages list says it. */
export const SETTLED: Record<string, string> = {
  needs_review: "Ready to review",
  approved: "Approved",
  published: "Published",
};

export type FrameState = "building" | "waiting" | "done" | "failed";

/**
 * A build's steps as a card (B3.5c, B3.5d; D132, D140): the build steps card's header (the title
 * and the count chip, "01/13" rolling to "13/13 completed"), then either the steps as a list
 * (`folded` false: a build page while it builds) or, folded, the build illustration following the
 * build (still while it waits or once it's done), a footer step card (the spinner, a tick when
 * built, the red mark when it failed; the step it's on in words that morph) and a chevron that
 * unfolds every step (open by itself when `defaultOpen`, as for a failed build). Going from the
 * list to the frame, the list folds away as the illustration and the footer unfold (0.42 s on the
 * drawer's curve).
 */
export function StepsFrame({
  title,
  label,
  heading = "h2",
  steps,
  done,
  folded,
  state,
  status,
  progress,
  defaultOpen = false,
}: {
  title: string;
  /** The card's name for screen readers, when it isn't the title (a batch: key · template). */
  label?: string;
  heading?: "h2" | "h3";
  steps: BuildStep[];
  done: number;
  folded: boolean;
  state: FrameState;
  status: string;
  progress: number;
  defaultOpen?: boolean;
}) {
  const reduced = useReducedMotion() ?? false;
  const id = useId();
  // The chevron decides once pressed; until then, open when asked (a failed build).
  const [chosen, setChosen] = useState<boolean | null>(null);
  const open = chosen ?? defaultOpen;
  const showList = !folded || open;
  const Heading = heading;
  const fold = {
    initial: { height: 0, opacity: 0 },
    animate: { height: "auto", opacity: 1 },
    exit: { height: 0, opacity: 0 },
    // The drawer's curve (softer than the app's strong ease-out): a whole list folding away
    // reads as one change rather than a snap (traced: 530 → 196 px).
    transition: reduced
      ? { duration: 0 }
      : { duration: 0.42, ease: [0.32, 0.72, 0, 1] as const },
  };
  return (
    <section
      aria-label={label}
      aria-labelledby={label ? undefined : `${id}-title`}
      className="stroke-inside-thin flex flex-col overflow-hidden rounded-lg bg-foreground-01"
    >
      <div className="flex items-center gap-1.5 bg-surface-primary px-2.5 py-2 divider-b-thin">
        <Heading
          id={`${id}-title`}
          className="min-w-0 flex-1 truncate text-type-body-small leading-5 font-medium text-heading-02"
        >
          {title}
        </Heading>
        <StepCount done={done} total={steps.length} />
      </div>
      <AnimatePresence initial={false}>
        {folded ? (
          <motion.div key="figure" {...fold} className="overflow-hidden">
            <div className="mt-0.5 flex justify-center bg-foreground-02 py-4">
              <BuildFigure progress={progress} still={state !== "building"} />
            </div>
          </motion.div>
        ) : null}
        {folded ? (
          <motion.div key="footer" {...fold} className="overflow-hidden">
            <div className="mt-0.5 flex items-center gap-1.5 step-card p-2">
              {state === "building" ? (
                <BuildSpinnerIcon className="size-3.5 shrink-0 animate-step-spin text-icon-nav-active motion-reduce:animate-step-spin-slow" />
              ) : (
                <BuildStepIcon
                  state={
                    state === "failed"
                      ? "failed"
                      : state === "done"
                        ? "done"
                        : "idle"
                  }
                  className={cn(
                    "size-3.5 shrink-0",
                    state === "failed"
                      ? "text-step-failed"
                      : state === "done"
                        ? "text-highlight-blue-500"
                        : "text-icon-system",
                  )}
                  dotClassName={
                    state === "failed"
                      ? "fill-step-failed-dot"
                      : state === "done"
                        ? "fill-surface-primary"
                        : "fill-foreground-01"
                  }
                />
              )}
              <span
                className={cn(
                  "min-w-0 flex-1 overflow-hidden text-type-body-small leading-5 font-medium whitespace-nowrap",
                  state === "building" || state === "done"
                    ? "text-heading-02"
                    : "text-heading-06",
                )}
              >
                <MorphText>{status}</MorphText>
              </span>
              <button
                type="button"
                aria-expanded={open}
                aria-controls={`${id}-steps`}
                aria-label={open ? "Hide the steps" : "Show the steps"}
                onClick={() => setChosen(!open)}
                className="group flex size-6 shrink-0 items-center justify-center rounded-sm outline-none hover:bg-foreground-02 focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ChevronDownFigmaIcon className="size-3.5 text-icon-explainer transition-transform duration-200 ease-out group-aria-expanded:rotate-180 motion-reduce:transition-none" />
              </button>
            </div>
          </motion.div>
        ) : null}
        {showList ? (
          <motion.div
            key="steps"
            id={`${id}-steps`}
            {...fold}
            className="overflow-hidden"
          >
            <div className="pt-0.5">
              <BuildStepList steps={steps} />
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
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
 * Heading-02, and the count chip, StepCount: "01/13", then "13/13 completed" with a Spot-500-Blue
 * line once every step is done); then the steps 2 px apart, the last one
 * on the card's foot (the frame's 4 px below it taken off, owner). `done`
 * null shows the count loading.
 */
export function BuildStepsCard({
  steps,
  done,
  title = "Build steps",
}: {
  steps: BuildStep[];
  done: number | null;
  /** The card's heading: "Build steps", or a batch frame's template (B3.5b). */
  title?: string;
}) {
  return (
    <section
      aria-labelledby="build-steps-title"
      className="stroke-inside-thin flex flex-col gap-0.5 overflow-hidden rounded-lg bg-foreground-01"
    >
      <div className="flex items-center gap-1.5 bg-surface-primary px-2.5 py-2 divider-b-thin">
        <h2
          id="build-steps-title"
          className="min-w-0 flex-1 truncate text-type-body-small leading-5 font-medium text-heading-02"
        >
          {title}
        </h2>
        {done === null ? (
          <SkeletonText className="text-type-caption-2" width={72} />
        ) : (
          <StepCount done={done} total={steps.length} />
        )}
      </div>
      <BuildStepList steps={steps} />
    </section>
  );
}

/**
 * How many steps are done, as a chip (Figma Build, Completion chip; B3.5c, owner 2026-11-08): the
 * count padded to the total's digits ("01/13"), its numbers rolling as steps finish (torph); once
 * every step is done it reads "13/13 completed" and its line turns Spot-500-Blue, the pill growing
 * to fit the word.
 */
export function StepCount({ done, total }: { done: number; total: number }) {
  const complete = total > 0 && done >= total;
  const count = String(done).padStart(String(total).length, "0");
  return (
    <span
      className={cn(
        "shrink-0 rounded-lg bg-foreground-01 px-1.5 py-0.5 text-type-caption-2 font-medium text-heading-04 tabular-nums ring-half transition-shadow duration-200 ease-out ring-inset",
        complete ? "ring-spot-500-blue" : "ring-stroke",
      )}
    >
      <MorphText className="whitespace-nowrap">
        {complete ? `${total}/${total} completed` : `${count}/${total}`}
      </MorphText>
    </span>
  );
}

/** The steps, one under another, 2 px apart (the card's list; a batch frame's folded list). */
export function BuildStepList({ steps }: { steps: BuildStep[] }) {
  return (
    <ol className="flex flex-col gap-0.5">
      {steps.map((step) => (
        <StepRow key={step.id} step={step} />
      ))}
    </ol>
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
