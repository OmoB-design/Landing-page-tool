"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useId, useState } from "react";

import {
  BuildSpinnerIcon,
  BuildStepIcon,
  ChevronDownFigmaIcon,
} from "@/components/ui/lp-icons";
import { MorphText } from "@/components/ui/text-morph";
import { cn } from "@/lib/utils";
import type { BatchPage } from "@/lib/validators/build";

import { BuildFigure } from "./build-figure";
import { type BuildStep, BuildStepList, StepCount } from "./build-steps";

const READY = new Set(["needs_review", "approved", "published"]);

/** 1st, 2nd, 3rd, 4th … 11th, 12th, 13th. */
export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}

/** What a frame's footer says when the page isn't building: its status, as the row's pill says it. */
const SETTLED: Record<string, string> = {
  needs_review: "Ready to review",
  approved: "Approved",
  published: "Published",
};

/**
 * One page in the Builds panel (B3.5c, D132; owner 2026-11-08): a card with the build steps card's
 * header (the template and the count chip, "01/13" rolling up to "13/13 completed"), then the build
 * page's illustration following this page's build, then a footer in a step card: the spinner (a
 * tick when built, the red mark when it failed), the step it's on in words that morph as it moves
 * on, and a chevron that unfolds every step. A failed page unfolds them by itself, so the failed
 * step and its reason show. Waiting and built pages hold the illustration still.
 */
export function BatchFrameCard({
  page,
  steps,
  done,
}: {
  page: Pick<BatchPage, "key" | "template_name" | "status" | "waiting">;
  steps: BuildStep[];
  done: number;
}) {
  const reduced = useReducedMotion() ?? false;
  const listId = useId();
  const isReady = READY.has(page.status);
  const queued = page.status === "queued";
  const building = page.status === "building";
  const failed = page.status === "failed";
  // Folded unless it failed; the chevron decides after that.
  const [chosen, setChosen] = useState<boolean | null>(null);
  const open = chosen ?? failed;
  const running = steps.some((step) => step.state === "running");
  const current =
    steps.find((step) => step.state === "running") ??
    steps.find((step) => step.state === "idle");
  const failedStep = steps.find((step) => step.state === "failed");
  const progress = queued
    ? 0
    : isReady
      ? 1
      : steps.length
        ? (done + (running ? 0.5 : 0)) / steps.length
        : 0;
  const status = queued
    ? page.waiting
      ? `Waiting · ${ordinal(page.waiting)} in line`
      : "Waiting to start"
    : building
      ? (current?.label ?? "Starting")
      : failed
        ? failedStep
          ? `Failed · ${failedStep.label}`
          : "Failed"
        : (SETTLED[page.status] ?? page.status);
  return (
    <div className="flex flex-col gap-1">
      <span className="px-0.5 text-type-caption-2 font-medium text-heading-06">
        {page.key}
      </span>
      <section
        aria-label={`${page.key} · ${page.template_name}`}
        className="stroke-inside-thin flex flex-col gap-0.5 overflow-hidden rounded-lg bg-foreground-01"
      >
        <div className="flex items-center gap-1.5 bg-surface-primary px-2.5 py-2 divider-b-thin">
          <h3 className="min-w-0 flex-1 truncate text-type-body-small leading-5 font-medium text-heading-02">
            {page.template_name}
          </h3>
          <StepCount done={queued ? 0 : done} total={steps.length} />
        </div>
        <div className="flex justify-center bg-foreground-02 py-4">
          <BuildFigure progress={progress} still={!building} />
        </div>
        <div className="flex items-center gap-1.5 step-card p-2">
          {building ? (
            <BuildSpinnerIcon className="size-3.5 shrink-0 animate-step-spin text-icon-nav-active motion-reduce:animate-step-spin-slow" />
          ) : (
            <BuildStepIcon
              state={failed ? "failed" : isReady ? "done" : "idle"}
              className={cn(
                "size-3.5 shrink-0",
                failed
                  ? "text-step-failed"
                  : isReady
                    ? "text-highlight-blue-500"
                    : "text-icon-system",
              )}
              dotClassName={
                failed
                  ? "fill-step-failed-dot"
                  : isReady
                    ? "fill-surface-primary"
                    : "fill-foreground-01"
              }
            />
          )}
          <span
            className={cn(
              "min-w-0 flex-1 overflow-hidden text-type-body-small leading-5 font-medium whitespace-nowrap",
              building || isReady ? "text-heading-02" : "text-heading-06",
            )}
          >
            <MorphText>{status}</MorphText>
          </span>
          <button
            type="button"
            aria-expanded={open}
            aria-controls={listId}
            aria-label={open ? "Hide the steps" : "Show the steps"}
            onClick={() => setChosen(!open)}
            className="group flex size-6 shrink-0 items-center justify-center rounded-sm outline-none hover:bg-foreground-02 focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronDownFigmaIcon className="size-3.5 text-icon-explainer transition-transform duration-200 ease-out group-aria-expanded:rotate-180 motion-reduce:transition-none" />
          </button>
        </div>
        <AnimatePresence initial={false}>
          {open ? (
            <motion.div
              key="steps"
              id={listId}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={
                reduced
                  ? { duration: 0 }
                  : { duration: 0.24, ease: [0.23, 1, 0.32, 1] }
              }
              className="overflow-hidden"
            >
              <BuildStepList steps={steps} />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </section>
    </div>
  );
}
