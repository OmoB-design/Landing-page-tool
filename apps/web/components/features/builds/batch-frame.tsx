"use client";

import type { BatchPage } from "@/lib/validators/build";

import { type BuildStep, SETTLED, StepsFrame } from "./build-steps";

const READY = new Set(["needs_review", "approved", "published"]);

/** 1st, 2nd, 3rd, 4th … 11th, 12th, 13th. */
export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}

/**
 * One page in the Builds panel (B3.5c, D132; owner 2026-11-08): its key over the shared frame
 * (StepsFrame, folded): the template and the count, the build illustration following this page's
 * build, a footer with the step it's on and a chevron that unfolds every step (open by itself
 * when it failed). Waiting and built pages hold the illustration still.
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
  const isReady = READY.has(page.status);
  const queued = page.status === "queued";
  const building = page.status === "building";
  const failed = page.status === "failed";
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
      <StepsFrame
        title={page.template_name}
        label={`${page.key} · ${page.template_name}`}
        heading="h3"
        steps={steps}
        done={queued ? 0 : done}
        folded
        defaultOpen={failed}
        state={
          failed
            ? "failed"
            : isReady
              ? "done"
              : building
                ? "building"
                : "waiting"
        }
        status={status}
        progress={progress}
      />
    </div>
  );
}
