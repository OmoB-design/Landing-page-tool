"use client";

import { ProgressDoneIcon } from "@/components/ui/lp-icons";
import { cn } from "@/lib/utils";
import {
  type StepId,
  WIZARD_STEPS,
  type WizardState,
  canOpen,
  stepIndex,
  stepReady,
} from "@/lib/wizard/state";

/** The steps that count towards "n/5 completed" (Review & build is where you finish). */
const COUNTED = WIZARD_STEPS.filter((step) => step.id !== "review");

/**
 * The wizard's progress column (Figma: Create new page, Progress), 200 px: a 52 px header on
 * Dashboard ("Progress" in 13 px medium Heading-01 over "n/5 completed" in 11 px medium
 * Heading-05), then the steps 24 px down and 12 px in, 4 px apart. Each is a 28 px row with 6 px
 * corners: a 10 px dot 6 px in (Spot-500-Blue with a tick once passed) and the name in 13 px
 * medium, Heading-01 once passed and Heading-05 for the current step (on its Foreground-01 fill)
 * and those ahead. The current row's fill slides to the next step as you go. Passed and open steps
 * take you back.
 */
export function WizardProgress({
  state,
  onOpen,
}: {
  state: WizardState;
  onOpen: (step: StepId) => void;
}) {
  const current = stepIndex(state.step);
  const done = COUNTED.filter(
    (step, index) => index < current && stepReady(state, step.id),
  ).length;
  return (
    <nav
      aria-label="Progress"
      className="hidden w-50 shrink-0 flex-col border-r-(length:--wizard-line) border-stroke lg:flex"
    >
      <div className="flex h-13 shrink-0 flex-col justify-center gap-0.5 border-b-(length:--wizard-line) border-stroke bg-dashboard px-4">
        <span className="text-type-body-small font-medium text-heading-01">
          Progress
        </span>
        <span className="text-type-caption-2 font-medium text-heading-05 tabular-nums">
          {done}/{COUNTED.length} completed
        </span>
      </div>
      <ol className="relative flex flex-col gap-1 px-3 pt-6 pb-3">
        <span
          aria-hidden
          className="absolute inset-x-3 top-6 h-7 rounded-sm bg-foreground-01 transition-transform duration-250 ease-out motion-reduce:transition-none"
          // Under the current step: rows are 28 px with 4 px between (data, not styling).
          style={{ transform: `translateY(${current * 2}rem)` }}
        />
        {WIZARD_STEPS.map((step, index) => {
          const passed = index < current;
          const isCurrent = index === current;
          return (
            <li key={step.id} className="relative">
              <button
                type="button"
                disabled={!canOpen(state, step.id)}
                aria-current={isCurrent ? "step" : undefined}
                onClick={() => {
                  if (!isCurrent) onOpen(step.id);
                }}
                className={cn(
                  "flex h-7 w-full items-center gap-1.5 rounded-sm px-1.5 text-left text-type-body-small font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default",
                  passed ? "text-heading-01" : "text-heading-05",
                  !isCurrent &&
                    "transition-colors duration-150 ease-out enabled:hover:bg-foreground-01",
                )}
              >
                {passed ? (
                  <ProgressDoneIcon className="shrink-0" />
                ) : (
                  <span
                    aria-hidden
                    className="size-2.5 shrink-0 rounded-full bg-meta-dot"
                  />
                )}
                {step.label}
                {passed ? <span className="sr-only"> (done)</span> : null}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
