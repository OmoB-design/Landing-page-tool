"use client";

import { useState } from "react";
import { z } from "zod";

import { formatCost } from "@/components/app/row-meta";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ShimmerText } from "@/components/ui/shimmer-loader";
import { STATUS_LABELS, isActive, progressPercent } from "@/lib/jobs/progress";
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

function JobProgress({ job }: { job: JobDetail }) {
  const latest = job.events.at(-1) ?? null;
  const percent = progressPercent(
    [...job.events].reverse().find((event) => event.data?.step !== undefined) ??
      latest,
  );
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{STATUS_LABELS[job.status]}</span>
        <span className="text-fg-muted tabular-nums">
          Attempt {Math.max(job.attempts, 1)} of {job.max_attempts}
        </span>
      </div>
      {isActive(job.status) || job.status === "succeeded" ? (
        <Progress
          value={job.status === "succeeded" ? 100 : (percent ?? 0)}
          aria-label="Demo job progress"
        />
      ) : null}
      {job.status === "succeeded" ? <DemoResult result={job.result} /> : null}
      {job.error ? (
        <p role="alert" className="text-sm text-danger">
          {job.error.message}
        </p>
      ) : null}
      {job.status === "queued" ? (
        <ShimmerText className="text-sm">Waiting for the worker…</ShimmerText>
      ) : null}
      <ol
        aria-live="polite"
        className="flex flex-col gap-0.5 text-sm text-fg-muted"
      >
        {job.events
          // The error is already shown above; don't repeat it as the last log line.
          .filter(
            (event) =>
              !(
                event.level === "error" && event.message === job.error?.message
              ),
          )
          .map((event) => (
            <li key={event.id}>{event.message}</li>
          ))}
      </ol>
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
