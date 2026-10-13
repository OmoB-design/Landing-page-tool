"use client";

import { formatDistanceToNowStrict } from "date-fns";
import { useState } from "react";

import { JobSteps } from "@/components/app/job-steps";
import { SkeletonButton } from "@/components/app/skeletons";
import { Button } from "@/components/ui/button";
import { RefreshFigmaIcon } from "@/components/ui/lp-icons";
import { usePageRefresh } from "@/lib/hooks/use-page-refresh";
import { useJob, useStartJob } from "@/lib/queries/jobs";
import type { Briefing } from "@/lib/validators/product";

import { PULL_AGAIN } from "./product-actions";

const BRIEFING_STEPS = [
  { id: "read", label: "Read the product" },
  { id: "write", label: "Write the briefing" },
];

/**
 * The cached wizard briefing (BUILD_SPEC §7.5): four audiences plus benefits, features and
 * objections. Written on demand by the product_briefing job and refreshable.
 */
export function ProductBriefing({
  productId,
  briefing,
  updatedAt,
}: {
  productId: string;
  briefing: Briefing | null;
  updatedAt: Date | null;
}) {
  const startJob = useStartJob();
  const [jobId, setJobId] = useState<string | null>(null);
  const { data: job } = useJob(jobId);
  usePageRefresh(job?.status === "succeeded" ? job.id : null);
  const busy =
    startJob.isPending || job?.status === "queued" || job?.status === "running";

  const write = () =>
    startJob.mutate(
      { kind: "product_briefing", payload: { product_id: productId } },
      { onSuccess: ({ job: started }) => setJobId(started.id) },
    );

  return (
    <section aria-labelledby="briefing-title" className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h3
            id="briefing-title"
            className="text-type-body-large leading-normal font-medium text-heading-01"
          >
            Briefing
          </h3>
          <p className="flex flex-wrap items-center gap-1.5 text-type-body-small font-medium text-heading-04">
            <span>Who the page can speak to, and what to say.</span>
            {briefing && updatedAt ? (
              <>
                <span
                  aria-hidden
                  className="size-0.75 rounded-full bg-foreground-03"
                />
                <span>
                  Written{" "}
                  <time
                    dateTime={updatedAt.toISOString()}
                    title={updatedAt.toLocaleString("en-GB")}
                    // Worked out again in the browser; a minute may tick over since the server.
                    suppressHydrationWarning
                  >
                    {written(updatedAt)}
                  </time>
                </span>
              </>
            ) : null}
          </p>
        </div>
        {briefing ? (
          // Already written: the Pull again button and icon, as Refresh (owner, 2026-10-13).
          <Button
            variant="outline"
            size="compact"
            className={PULL_AGAIN}
            onClick={write}
            disabled={busy}
          >
            <RefreshFigmaIcon className="size-4 text-icon-nav-active" />
            Refresh
          </Button>
        ) : (
          <Button
            size="compact"
            className="h-7.5 shrink-0 px-4"
            onClick={write}
            disabled={busy}
          >
            Generate
          </Button>
        )}
      </div>
      {startJob.error ? (
        <p role="alert" className="text-type-caption-1 text-text-danger">
          {startJob.error.message}
        </p>
      ) : null}
      {job && job.status !== "succeeded" ? (
        <JobSteps
          title="Writing the briefing"
          steps={BRIEFING_STEPS}
          job={job}
          className="w-75 [&_.ui-progress]:pb-6.5"
        />
      ) : null}

      {briefing ? (
        <div className="flex flex-col gap-8">
          <div className="flex flex-col gap-1.5">
            <h4 className="text-type-body-large leading-normal font-medium text-heading-01">
              Audience
            </h4>
            <ul className="grid gap-4 sm:grid-cols-2">
              {briefing.audiences.map((audience) => (
                <li
                  key={audience.name}
                  className="flex flex-col gap-1 rounded-t-item rounded-b-sm px-2.5 py-4 ring-thin ring-stroke ring-inset"
                >
                  <span className="text-type-body-large leading-normal font-medium text-heading-03">
                    {audience.name}
                  </span>
                  <span className="text-type-caption-1 font-medium text-heading-05">
                    {audience.description}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="grid items-start gap-4 sm:grid-cols-3">
            <BriefingList title="Benefits" items={briefing.benefits} />
            <BriefingList title="Features" items={briefing.features} />
            <BriefingList title="Objections" items={briefing.objections} />
          </div>
        </div>
      ) : null}
    </section>
  );
}

/** "3 hours ago": when the briefing was written. */
function written(date: Date): string {
  return formatDistanceToNowStrict(date, { addSuffix: true });
}

/**
 * A briefing column (Figma Brands Details): a Dashboard tile with 10 px corners and a 0.8 px Stroke
 * line, the 13 px medium title 8 px in, then the items 4 px apart, each a card with 12 px corners
 * and a 0.5 px line (Surface-Primary with a soft shadow in light, Foreground-01 in dark), its
 * 12 px medium Heading-04 text 8 px in.
 */
function BriefingList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="flex flex-col rounded-lg bg-dashboard ring-thin ring-stroke ring-inset">
      <h4 className="px-2.5 py-2 text-type-body-small font-medium text-heading-01">
        {title}
      </h4>
      <ul className="flex flex-col gap-1 px-1 pb-1">
        {items.map((item) => (
          <li
            key={item}
            className="briefing-item bg-surface-primary px-2 py-3 text-type-caption-1 font-medium text-heading-04 dark:bg-foreground-01"
          >
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The briefing's heading while the product loads; its button (Generate or Refresh) not ready yet. */
export function ProductBriefingSkeleton() {
  return (
    <div aria-hidden className="flex items-start justify-between gap-4">
      <div className="flex flex-col gap-2">
        <span className="text-type-body-large leading-normal font-medium text-heading-01">
          Briefing
        </span>
        <span className="text-type-body-small font-medium text-heading-04">
          Who the page can speak to, and what to say.
        </span>
      </div>
      <SkeletonButton width={92} radius="var(--radius-md)" />
    </div>
  );
}
