"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  CardChevronIcon,
  StepDoneIcon,
  StepTodoIcon,
} from "@/components/ui/lp-icons";
import type { SetupStep } from "@/lib/onboarding/progress";
import { cn } from "@/lib/utils";

// Whether the card is folded, remembered in this browser (a per-viewer convenience). Read as an
// external store so the server renders it open and the browser's value applies after hydration.
const STORAGE_KEY = "lp-setup-card";
const listeners = new Set<() => void>();
function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}
function readFolded(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "folded";
  } catch {
    return false; // storage unavailable (private window): the card stays open
  }
}
function writeFolded(folded: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, folded ? "folded" : "open");
  } catch {
    // Not remembering the fold is fine.
  }
  for (const listener of listeners) listener();
}

/**
 * The getting-started card above the profile card (Figma: Side Nav — Getting started Card, and
 * Getting started Card closed). Open: a 20 px progress ring and a chevron, "Getting Started" in
 * 13 px medium, "N/5 steps completed" in 11 px, then the steps, 12 px apart, each a 14 px circle
 * (a blue disc with a tick once done) and its label in 12 px medium (done steps in heading-05).
 * Open it has a stroke border and the inner edge shadow; closed, a stroke-strong border and a soft
 * lift. The chevron folds it (remembered in this browser); it goes once every step is done.
 */
export function SidebarSetup({
  steps,
  done,
  total,
}: {
  steps: SetupStep[];
  done: number;
  total: number;
}) {
  const open = !useSyncExternalStore(subscribe, readFolded, () => false);
  const toggle = (next: boolean) => writeFolded(!next);
  if (done >= total) return null;

  return (
    <Collapsible
      open={open}
      onOpenChange={toggle}
      className={cn(
        "flex flex-col gap-3 rounded-lg border bg-surface-primary p-3",
        open
          ? "border-stroke shadow-edge"
          : "border-stroke-strong shadow-raise",
      )}
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <ProgressRing done={done} total={total} />
          <CollapsibleTrigger
            aria-label={
              open ? "Fold getting started" : "Unfold getting started"
            }
            className="flex size-5 items-center justify-center rounded-xsm text-icon-system outline-none hover:bg-foreground-02 hover:text-icon-nav-active focus-visible:ring-2 focus-visible:ring-ring"
          >
            <CardChevronIcon />
          </CollapsibleTrigger>
        </div>
        <div className="flex flex-col">
          <h2 className="text-type-body-small font-medium text-heading-01">
            Getting Started
          </h2>
          <p className="text-type-caption-2 font-medium text-heading-05 tabular-nums">
            {done}/{total} steps completed
          </p>
        </div>
      </div>
      <CollapsibleContent>
        <ol className="flex flex-col gap-3">
          {steps.map((step) => (
            <li key={step.id}>
              <Link
                href={step.href}
                className={cn(
                  "flex items-center gap-1 rounded-xsm text-type-caption-1 font-medium outline-none hover:text-heading-01 focus-visible:ring-2 focus-visible:ring-ring",
                  step.done ? "text-heading-05" : "text-body",
                )}
              >
                {step.done ? (
                  <StepDoneIcon className="size-3.5 shrink-0" />
                ) : (
                  <StepTodoIcon className="size-3.5 shrink-0 text-stroke-input-hover" />
                )}
                <span className="truncate">{step.label}</span>
                <span className="sr-only">
                  {step.done ? " (done)" : " (to do)"}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </CollapsibleContent>
    </Collapsible>
  );
}

/** The 20 px ring (Figma): a 1.92 px track, and a blue arc that starts at 9 o'clock and runs
 * anticlockwise as steps are done. */
function ProgressRing({ done, total }: { done: number; total: number }) {
  const radius = 9.04;
  const length = 2 * Math.PI * radius;
  const filled = total > 0 ? (done / total) * length : 0;
  return (
    <svg
      viewBox="0 0 20 20"
      role="img"
      aria-label={`${done} of ${total} steps completed`}
      className="size-5 -scale-x-100"
    >
      <circle
        cx="10"
        cy="10"
        r={radius}
        fill="none"
        strokeWidth="1.92"
        className="stroke-stroke-input-hover"
      />
      <circle
        cx="10"
        cy="10"
        r={radius}
        fill="none"
        strokeWidth="1.92"
        strokeLinecap="round"
        // The arc length is data (progress), not styling.
        strokeDasharray={`${filled} ${length}`}
        className="stroke-spot-500-blue"
      />
    </svg>
  );
}
