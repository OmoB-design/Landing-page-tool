"use client";

import { useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNowStrict } from "date-fns";
import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import {
  CheckIcon,
  JobsIcon,
  LoadingIcon,
  StatusBuildingIcon,
  StatusFailedIcon,
} from "@/components/ui/icons";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { ShimmerText, Skeleton } from "@/components/ui/shimmer-loader";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  STATUS_LABELS,
  isActive,
  jobTitle,
  progressPercent,
} from "@/lib/jobs/progress";
import { useJobs } from "@/lib/queries/jobs";
import { notificationKeys } from "@/lib/queries/notifications";
import { cn } from "@/lib/utils";
import type { JobStatus, JobSummary } from "@/lib/validators/jobs";

import { toast } from "./toaster";

/**
 * Top-bar jobs tray (DESIGN.md §5.2 JobTray): a button with the number of running jobs and a
 * popover of recent jobs with live progress. Your own running jobs also show as toasts whose
 * progress line updates live and turns into a done/failed toast when they finish.
 */
export function JobTray({ userId }: { userId: string }) {
  const { data, isPending } = useJobs();
  const jobs = data?.jobs ?? [];
  const running = jobs.filter((job) => isActive(job.status)).length;
  useJobToasts(jobs, userId);

  const label = running > 0 ? `Jobs, ${running} running` : "Jobs";
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={label}
              className="relative"
            >
              <JobsIcon
                aria-hidden
                className={cn(running > 0 && "text-accent")}
              />
              {running > 0 ? (
                <span
                  aria-hidden
                  className="absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-accent text-xs font-medium text-surface tabular-nums"
                >
                  {running}
                </span>
              ) : null}
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-80 gap-0 p-0">
        <h2 className="border-b border-border px-3 py-2 text-sm font-medium">
          Jobs
        </h2>
        {isPending ? (
          <div className="flex flex-col gap-2 p-3" aria-label="Loading jobs">
            <Skeleton height="var(--spacing-row)" radius="var(--radius-sm)" />
            <Skeleton height="var(--spacing-row)" radius="var(--radius-sm)" />
          </div>
        ) : jobs.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-fg-muted">
            No jobs yet
          </p>
        ) : (
          <ul className="max-h-96 overflow-y-auto" aria-live="polite">
            {jobs.map((job) => (
              <JobItem key={job.id} job={job} />
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}

function JobItem({ job }: { job: JobSummary }) {
  const percent = progressPercent(job.latest);
  const line =
    job.status === "failed"
      ? job.error?.message
      : (job.latest?.message ?? <ShimmerText>Waiting to start…</ShimmerText>);
  return (
    <li className="flex flex-col gap-1.5 border-b border-border px-3 py-2.5 last:border-b-0">
      <div className="flex items-center gap-2">
        <JobStatusIcon status={job.status} />
        <span className="text-base font-medium">{jobTitle(job.kind)}</span>
        <span className="ml-auto text-xs text-fg-muted">
          {STATUS_LABELS[job.status]}
        </span>
      </div>
      {line ? (
        <p
          className={cn(
            "truncate text-sm text-fg-muted",
            job.status === "failed" && "text-danger",
          )}
        >
          {line}
        </p>
      ) : null}
      {isActive(job.status) ? (
        <Progress
          value={percent ?? 0}
          aria-label={`${jobTitle(job.kind)} progress`}
        />
      ) : null}
      <time dateTime={job.created_at} className="text-xs text-fg-subtle">
        Started{" "}
        {formatDistanceToNowStrict(new Date(job.created_at), {
          addSuffix: true,
        })}
      </time>
    </li>
  );
}

function JobStatusIcon({ status }: { status: JobStatus }) {
  switch (status) {
    case "queued":
      return (
        <StatusBuildingIcon aria-hidden className="size-4 text-fg-muted" />
      );
    case "running":
      return (
        <LoadingIcon
          aria-hidden
          className="size-4 animate-spin text-accent motion-reduce:animate-none"
        />
      );
    case "succeeded":
      return <CheckIcon aria-hidden className="size-4 text-success" />;
    default:
      return <StatusFailedIcon aria-hidden className="size-4 text-danger" />;
  }
}

/** Live toasts for the user's own jobs: a loading toast while running, then done/failed. */
function useJobToasts(jobs: JobSummary[], userId: string) {
  const queryClient = useQueryClient();
  const lastStatus = useRef(new Map<string, JobStatus>());

  useEffect(() => {
    for (const job of jobs) {
      const previous = lastStatus.current.get(job.id);
      lastStatus.current.set(job.id, job.status);
      if (job.created_by !== userId) continue;
      const title = jobTitle(job.kind);

      if (isActive(job.status)) {
        toast.loading(title, {
          id: job.id,
          description: job.latest?.message ?? "Queued",
          duration: Infinity,
        });
      } else if (previous && isActive(previous)) {
        if (job.status === "succeeded") {
          toast.success(`${title} finished`, {
            id: job.id,
            description: null,
            duration: 5000,
          });
        } else if (job.status === "failed") {
          toast.error(`${title} failed`, {
            id: job.id,
            description: job.error?.message,
            duration: 8000,
          });
        } else {
          toast.dismiss(job.id);
        }
        // The worker wrote a notification for the finished job.
        void queryClient.invalidateQueries({ queryKey: notificationKeys.all });
      }
    }
  }, [jobs, userId, queryClient]);
}
