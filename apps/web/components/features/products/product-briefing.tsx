"use client";

import { useState } from "react";

import { JobSteps } from "@/components/app/job-steps";
import { RelativeTime } from "@/components/app/row-meta";
import { Button } from "@/components/ui/button";
import { RefreshIcon } from "@/components/ui/icons";
import { usePageRefresh } from "@/lib/hooks/use-page-refresh";
import { useJob, useStartJob } from "@/lib/queries/jobs";
import type { Briefing } from "@/lib/validators/product";

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
    <section aria-labelledby="briefing-title" className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-0.5">
          <h2
            id="briefing-title"
            className="text-type-body-large font-semibold"
          >
            Briefing
          </h2>
          <p className="text-type-caption-1 text-sub-text">
            {briefing && updatedAt ? (
              <>
                Who the page can speak to, and what to say. Written{" "}
                <RelativeTime date={updatedAt} />.
              </>
            ) : (
              "Who the page can speak to, and what to say. Used when you create a page."
            )}
          </p>
        </div>
        <Button
          variant={briefing ? "outline" : "default"}
          size="sm"
          className="h-8 shrink-0"
          onClick={write}
          disabled={busy}
        >
          {briefing ? <RefreshIcon aria-hidden /> : null}
          {briefing ? "Refresh" : "Write briefing"}
        </Button>
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
        />
      ) : null}

      {briefing ? (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <h3 className="text-type-caption-1 font-medium text-sub-text">
              Audiences
            </h3>
            <ul className="grid gap-3 sm:grid-cols-2">
              {briefing.audiences.map((audience) => (
                <li
                  key={audience.name}
                  className="flex flex-col gap-1 rounded-md border border-stroke p-3"
                >
                  <span className="text-type-body-small font-medium">
                    {audience.name}
                  </span>
                  <span className="text-type-caption-1 text-sub-text">
                    {audience.description}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="grid gap-6 sm:grid-cols-3">
            <BriefingList title="Benefits" items={briefing.benefits} />
            <BriefingList title="Features" items={briefing.features} />
            <BriefingList title="Objections" items={briefing.objections} />
          </div>
        </div>
      ) : null}
    </section>
  );
}

function BriefingList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-type-caption-1 font-medium text-sub-text">{title}</h3>
      <ul className="flex list-disc flex-col gap-1 pl-4 text-type-caption-1">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
