"use client";

import { useState } from "react";

import { toast } from "@/components/app/toaster";
import { useFollowedJob, useStartJob } from "@/lib/queries/jobs";

/**
 * Exporting a page as one self-contained HTML file (BUILD_SPEC §12.2): a job, then the download
 * of `<KEY>.html` when it finishes; a toast says why if it fails. The build page's ⋯ menu has
 * Export (D141; it was a header button before).
 */
export function useExportPage(buildId: string, buildKey: string) {
  const startJob = useStartJob();
  const [jobId, setJobId] = useState<string | null>(null);
  const { running } = useFollowedJob(jobId, {
    succeeded: () => {
      const link = document.createElement("a");
      link.href = `/api/builds/${buildId}/export`;
      link.download = `${buildKey}.html`;
      link.click();
    },
    failed: (job) =>
      toast.error(job.error?.message ?? "Couldn’t export the page."),
  });
  return {
    busy: startJob.isPending || running,
    start: () =>
      startJob.mutate(
        { kind: "export", payload: { build_id: buildId } },
        {
          onSuccess: ({ job: started }) => setJobId(started.id),
          onError: (error) => toast.error(error.message),
        },
      ),
  };
}
