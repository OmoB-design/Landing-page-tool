"use client";

import { format } from "date-fns";
import { useState } from "react";

import {
  SkeletonButton,
  SkeletonStatus,
  SkeletonText,
} from "@/components/app/skeletons";
import {
  type Viewport,
  ViewportSwitch,
} from "@/components/app/viewport-switch";
import { useHydrated } from "@/lib/use-hydrated";
import { cn } from "@/lib/utils";

// Desktop / Phone's width (measured): with its labels from the xl breakpoint, icons only below.
const SWITCH_WIDE = 152;
const SWITCH_NARROW = 60;

/**
 * The client's review page (B3.6, D119; no Figma frame yet, the workspace's look without its
 * sidebar or any of our branding): the grey canvas with a slim bar (the page's title and when it
 * was approved; Desktop / Phone in the middle), and the approved page in the white panel below,
 * full width or 390 px wide. The page runs sandboxed with its scripts off, as in the team's preview.
 */
export function ReviewView({
  token,
  title,
  approvedAt,
}: {
  token: string;
  title: string;
  approvedAt: string;
}) {
  const [viewport, setViewport] = useState<Viewport>("desktop");
  const hydrated = useHydrated();
  const phone = viewport === "phone";
  return (
    <div className="flex h-dvh flex-col bg-dashboard p-1.5 text-body">
      <header className="flex h-12 shrink-0 items-center gap-3 px-2.5">
        <div className="flex min-w-0 flex-1 flex-col">
          <h1 className="truncate text-type-body-small font-medium text-heading-01">
            {title}
          </h1>
          <p className="truncate text-type-caption-1 font-medium text-heading-05">
            {hydrated
              ? `Approved ${format(new Date(approvedAt), "d MMM yyyy")} · view only`
              : "View only"}
          </p>
        </div>
        <ViewportSwitch value={viewport} onChange={setViewport} />
        <div aria-hidden className="flex-1" />
      </header>
      <main
        className={cn(
          "flex min-h-0 flex-1 justify-center overflow-hidden rounded-panel edge",
          phone ? "bg-foreground-02 p-3" : "bg-surface-primary",
        )}
      >
        <iframe
          src={`/review/${encodeURIComponent(token)}/html`}
          title={title}
          sandbox="allow-popups allow-popups-to-escape-sandbox"
          referrerPolicy="no-referrer"
          className={cn(
            "h-full border-0 bg-surface-primary",
            phone
              ? "w-97.5 max-w-full rounded-lg shadow-light ring-thin ring-stroke"
              : "w-full",
          )}
        />
      </main>
    </div>
  );
}

/** While the link is checked: the same bar and panel, box for box. */
export function ReviewLoading() {
  return (
    <div className="flex h-dvh flex-col bg-dashboard p-1.5 text-body">
      <SkeletonStatus label="Loading the page" />
      <header className="flex h-12 shrink-0 items-center gap-3 px-2.5">
        <div className="flex min-w-0 flex-1 flex-col">
          <SkeletonText className="text-type-body-small" width={260} />
          <SkeletonText className="text-type-caption-1" width={170} />
        </div>
        <span className="hidden xl:flex">
          <SkeletonButton
            width={SWITCH_WIDE}
            height={30}
            radius="var(--radius-md)"
          />
        </span>
        <span className="flex xl:hidden">
          <SkeletonButton
            width={SWITCH_NARROW}
            height={30}
            radius="var(--radius-md)"
          />
        </span>
        <div aria-hidden className="flex-1" />
      </header>
      <main className="flex min-h-0 flex-1 rounded-panel bg-surface-primary edge" />
    </div>
  );
}

/** The link isn't one, expired or was turned off; or the page can't be fetched right now. */
export function ReviewGone({ unreachable }: { unreachable: boolean }) {
  return (
    <div className="flex h-dvh items-center justify-center bg-dashboard p-4 text-body">
      <div className="flex max-w-sm flex-col gap-1 rounded-panel bg-surface-primary px-6 py-5 text-center edge">
        <h1 className="text-type-body-small font-medium text-heading-01">
          {unreachable
            ? "This page can’t be shown right now"
            : "This link isn’t available any more"}
        </h1>
        <p className="text-type-caption-1 font-medium text-heading-05">
          {unreachable
            ? "Try again in a moment."
            : "It may have expired or been turned off. Ask the person who sent it for a new one."}
        </p>
      </div>
    </div>
  );
}
