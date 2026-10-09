"use client";

import { useState } from "react";
import { z } from "zod";

import { JobSteps } from "@/components/app/job-steps";
import { formatCost } from "@/components/app/row-meta";
import { Button } from "@/components/ui/button";
import { STATUS_LABELS } from "@/lib/jobs/progress";
import { useJob, useJobs, useStartJob } from "@/lib/queries/jobs";
import type { JobDetail } from "@/lib/validators/jobs";

/**
 * Temporary (B0.4): starts the worker's `noop_demo` job and shows its live progress, to prove
 * the job system end to end. Costs nothing. Removed once real jobs (brand autofetch) exist.
 */
export function DemoJobCard() {
  const startJob = useStartJob();
  const [jobId, setJobId] = useState<string | null>(null);
  // After a reload, show the latest demo job instead of an empty card.
  const { data: recent } = useJobs();
  const latestDemo =
    recent?.jobs.find((candidate) => candidate.kind === "noop_demo")?.id ??
    null;
  const { data: job } = useJob(jobId ?? latestDemo);

  function run(payload: Record<string, unknown>) {
    startJob.mutate(
      { kind: "noop_demo", payload },
      { onSuccess: ({ job: started }) => setJobId(started.id) },
    );
  }

  return (
    <section
      aria-labelledby="demo-job-title"
      className="flex max-w-xl flex-col gap-4 rounded-lg border border-border bg-surface p-4"
    >
      <div className="flex flex-col gap-1">
        <h2 id="demo-job-title" className="text-md font-semibold">
          Demo job
        </h2>
        <p className="text-sm text-fg-muted">
          Starts a background job on the worker that reports five steps, so you
          can watch the job system work. Costs nothing. Temporary, for testing
          B0.4.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => run({})} disabled={startJob.isPending}>
          Run demo job
        </Button>
        <Button
          variant="outline"
          onClick={() => run({ fail_at: 3 })}
          disabled={startJob.isPending}
        >
          Run a failing demo
        </Button>
      </div>
      {startJob.error ? (
        <p role="alert" className="text-sm text-danger">
          {startJob.error.message}
        </p>
      ) : null}
      {job ? <JobProgress job={job} /> : null}
    </section>
  );
}

const DEMO_STEPS = [
  { id: "start", label: "Start the job" },
  { id: "check-in", label: "Check in with the worker" },
  { id: "ai", label: "Ask the AI (mock)" },
  { id: "image", label: "Draw and save an image (mock)" },
  { id: "finish", label: "Finish up" },
];

function JobProgress({ job }: { job: JobDetail }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{STATUS_LABELS[job.status]}</span>
        <span className="text-fg-muted tabular-nums">
          Attempt {Math.max(job.attempts, 1)} of {job.max_attempts}
        </span>
      </div>
      <JobSteps title="Demo job steps" steps={DEMO_STEPS} job={job} />
      {job.status === "succeeded" ? <DemoResult result={job.result} /> : null}
    </div>
  );
}

const demoResultSchema = z.object({
  ledger_rows: z.number(),
  cost_usd: z.string(),
  image_url: z.string().nullable(),
});

/** What the job recorded: ledger rows and cost (mock calls are $0) and the saved image. */
function DemoResult({ result }: { result: JobDetail["result"] }) {
  const parsed = demoResultSchema.safeParse(result);
  if (!parsed.success) return null;
  const { ledger_rows, cost_usd, image_url } = parsed.data;
  return (
    <div className="flex items-center gap-3 rounded-md bg-surface-muted p-2">
      {image_url ? (
        // Temporary demo: the image is a placeholder from local Supabase Storage.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image_url}
          alt="Placeholder drawn by the mock image provider"
          className="h-12 w-16 rounded-xs border border-border object-cover"
        />
      ) : null}
      <p className="text-sm text-fg-muted">
        Ledger: {ledger_rows} {ledger_rows === 1 ? "row" : "rows"} ·{" "}
        <span className="tabular-nums">{formatCost(Number(cost_usd))}</span>{" "}
        (mock AI and image calls cost nothing)
      </p>
    </div>
  );
}
