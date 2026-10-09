"use client";

import { useState } from "react";

import { JobSteps } from "@/components/app/job-steps";
import { Button } from "@/components/ui/button";
import { DownloadIcon } from "@/components/ui/icons";
import { usePageRefresh } from "@/lib/hooks/use-page-refresh";
import { useJob, useStartJob } from "@/lib/queries/jobs";

const EXPORT_STEPS = [
  { id: "inline", label: "Inline images and fonts" },
  { id: "save", label: "Save the file" },
];

/** Export the page as one self-contained HTML file, then download it (BUILD_SPEC §12.2). */
export function ExportButton({
  buildId,
  buildKey,
  exported,
}: {
  buildId: string;
  buildKey: string;
  exported: boolean;
}) {
  const startJob = useStartJob();
  const [jobId, setJobId] = useState<string | null>(null);
  const { data: job } = useJob(jobId);
  usePageRefresh(job?.status === "succeeded" ? job.id : null);
  const busy =
    startJob.isPending || job?.status === "queued" || job?.status === "running";
  const download = `/api/builds/${buildId}/export`;

  return (
    <section aria-labelledby="export-title" className="flex flex-col gap-3">
      <h3 id="export-title" className="text-sm font-medium text-fg-muted">
        Export
      </h3>
      <div className="flex flex-wrap gap-2">
        {exported ? (
          <Button asChild size="sm" className="h-8">
            <a href={download} download={`${buildKey}.html`}>
              <DownloadIcon aria-hidden />
              Download {buildKey}.html
            </a>
          </Button>
        ) : null}
        <Button
          variant={exported ? "outline" : "default"}
          size="sm"
          className="h-8"
          disabled={busy}
          onClick={() =>
            startJob.mutate(
              { kind: "export", payload: { build_id: buildId } },
              { onSuccess: ({ job: started }) => setJobId(started.id) },
            )
          }
        >
          {exported ? "Export again" : "Export HTML"}
        </Button>
      </div>
      <p className="text-sm text-fg-muted">
        One self-contained file with its images inside, for hosting anywhere.
      </p>
      {startJob.error ? (
        <p role="alert" className="text-sm text-danger">
          {startJob.error.message}
        </p>
      ) : null}
      {job && job.status !== "succeeded" ? (
        <JobSteps title="Exporting" steps={EXPORT_STEPS} job={job} />
      ) : null}
    </section>
  );
}
