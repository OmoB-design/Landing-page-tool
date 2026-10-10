"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { CheckIcon, ChevronDownIcon } from "@/components/ui/icons";
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
 * The getting-started card at the bottom of the sidebar (D67, like the reference's onboarding
 * card): a progress ring, "Getting started", "N/M steps completed", and the steps as links with
 * a circle that becomes a tick. The chevron folds it to its header; the fold is remembered in
 * this browser. The card goes once every step is done.
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
      className="rounded-lg border border-stroke-strong bg-surface-primary p-2 shadow-panel"
    >
      <div className="flex items-start justify-between gap-2 px-1 pt-1">
        <ProgressRing done={done} total={total} />
        <CollapsibleTrigger
          aria-label={open ? "Fold getting started" : "Unfold getting started"}
          className="-mt-1 -mr-1 flex size-7 items-center justify-center rounded-sm text-sub-text outline-none hover:bg-foreground-02 hover:text-body focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronDownIcon
            aria-hidden
            className={cn(
              "size-4 transition-transform duration-150 ease-out motion-reduce:transition-none",
              !open && "rotate-180",
            )}
          />
        </CollapsibleTrigger>
      </div>
      <div className="flex flex-col px-1 pt-2 pb-1">
        <h2 className="text-type-body-small font-medium">Getting started</h2>
        <p className="text-type-caption-1 text-sub-text tabular-nums">
          {done}/{total} steps completed
        </p>
      </div>
      <CollapsibleContent>
        <ol className="flex flex-col gap-px pt-1">
          {steps.map((step) => (
            <li key={step.id}>
              <Link
                href={step.href}
                className="flex h-nav-item items-center gap-2 rounded-sm px-1 text-type-body-small text-body outline-none hover:bg-foreground-02 focus-visible:ring-2 focus-visible:ring-ring"
              >
                {step.done ? (
                  <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-spot-500-green text-white">
                    <CheckIcon aria-hidden className="size-2.5" />
                  </span>
                ) : (
                  <span
                    aria-hidden
                    className="size-4 shrink-0 rounded-full border border-stroke-strong"
                  />
                )}
                <span className={cn("truncate", step.done && "text-sub-text")}>
                  {step.label}
                </span>
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

/** A 20 px ring that fills clockwise with the accent colour as steps are done. */
function ProgressRing({ done, total }: { done: number; total: number }) {
  const radius = 8;
  const length = 2 * Math.PI * radius;
  const filled = total > 0 ? (done / total) * length : 0;
  return (
    <svg
      viewBox="0 0 20 20"
      role="img"
      aria-label={`${done} of ${total} steps completed`}
      className="size-5 -rotate-90"
    >
      <circle
        cx="10"
        cy="10"
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        className="text-foreground-03"
      />
      <circle
        cx="10"
        cy="10"
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        // The arc length is data (progress), not styling.
        strokeDasharray={`${filled} ${length}`}
        className="text-spot-500-indigo"
      />
    </svg>
  );
}
