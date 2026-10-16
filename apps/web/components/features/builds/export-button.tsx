"use client";

import { useEffect, useRef, useState } from "react";

import { toast } from "@/components/app/toaster";
import { ExportFigmaIcon } from "@/components/ui/lp-icons";
import { Spinner } from "@/components/ui/spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useJob, useStartJob } from "@/lib/queries/jobs";

/**
 * Export (Figma Build, the header's button): 32 px, Surface-Primary in a 0.5 px Stroke-Strong
 * line with Shadow/Panel and 8 px corners, the tray icon and "Export" in 12 px medium Heading-01.
 * It exports the page as one self-contained HTML file (BUILD_SPEC §12.2) and downloads it when
 * the export finishes; while it runs the icon becomes a spinner. Unavailable until the build has
 * a page.
 */
export function ExportButton({
  buildId,
  buildKey,
  ready,
}: {
  buildId: string;
  buildKey: string;
  ready: boolean;
}) {
  const startJob = useStartJob();
  const [jobId, setJobId] = useState<string | null>(null);
  const { data: job } = useJob(jobId);
  const handled = useRef<string | null>(null);
  const busy =
    startJob.isPending || job?.status === "queued" || job?.status === "running";

  useEffect(() => {
    if (!job || handled.current === job.id) return;
    if (job.status === "succeeded") {
      handled.current = job.id;
      const link = document.createElement("a");
      link.href = `/api/builds/${buildId}/export`;
      link.download = `${buildKey}.html`;
      link.click();
    } else if (job.status === "failed") {
      handled.current = job.id;
      toast.error(job.error?.message ?? "Couldn’t export the page.");
    }
  }, [job, buildId, buildKey]);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* A span keeps the tooltip working while the button is disabled. */}
        <span className="mr-1 inline-flex">
          <button
            type="button"
            disabled={!ready || busy}
            onClick={() =>
              startJob.mutate(
                { kind: "export", payload: { build_id: buildId } },
                {
                  onSuccess: ({ job: started }) => setJobId(started.id),
                  onError: (error) => toast.error(error.message),
                },
              )
            }
            className="flex h-8 items-center gap-1.5 rounded-md border-(length:--line-hairline) border-stroke-strong bg-surface-primary px-2.5 py-1 text-type-caption-1 font-medium text-heading-01 shadow-panel transition-transform duration-150 ease-out outline-none focus-visible:ring-2 focus-visible:ring-ring enabled:hover:bg-foreground-01 enabled:active:scale-97 disabled:cursor-default disabled:text-heading-06"
          >
            {busy ? (
              <Spinner className="size-3.5" label="Exporting" />
            ) : (
              <ExportFigmaIcon className="shrink-0 text-icon-nav-active" />
            )}
            {busy ? "Exporting…" : "Export"}
          </button>
        </span>
      </TooltipTrigger>
      <TooltipContent>
        {ready
          ? "Download the page as one HTML file, images inside"
          : "Available when the build finishes"}
      </TooltipContent>
    </Tooltip>
  );
}
