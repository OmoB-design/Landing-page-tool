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
 * Jobs tray (DESIGN.md §5.2 JobTray): a button with the number of running jobs and a popover of
 * recent jobs with live progress. Your own running jobs also show as toasts whose progress line
 * updates live and turns into a done/failed toast when they finish. `variant="row"` is the
 * sidebar row (D67): icon, "Jobs" and the running count.
 */
export function JobTray({
  userId,
  variant = "icon",
}: {
  userId: string;
  variant?: "icon" | "row";
}) {
  const { data, isPending } = useJobs();
  const jobs = data?.jobs ?? [];
  const running = jobs.filter((job) => isActive(job.status)).length;
  useJobToasts(jobs, userId);

  const label = running > 0 ? `Jobs, ${running} running` : "Jobs";
  const content = (
    <PopoverContent
      side={variant === "row" ? "right" : "bottom"}
      align="start"
      className="w-80 gap-0 p-0"
    >
      <JobList jobs={jobs} isPending={isPending} />
    </PopoverContent>
  );
  if (variant === "row") {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={label}
            className="flex h-nav-item w-full items-center gap-2 rounded-sm px-2 text-type-body-small text-body outline-none hover:bg-foreground-02 focus-visible:ring-2 focus-visible:ring-ring aria-expanded:bg-foreground-02"
          >
            <JobsIcon
              aria-hidden
              className={cn(
                "size-4 shrink-0",
                running > 0 ? "text-spot-500-indigo" : "text-sub-text",
              )}
            />
            <span className="truncate">Jobs</span>
            {running > 0 ? (
              <span
                aria-hidden
                className="ml-auto rounded-xsm bg-foreground-02 px-1.5 text-type-caption-1 text-sub-text tabular-nums"
              >
                {running}
              </span>
            ) : null}
          </button>
        </PopoverTrigger>
        {content}
      </Popover>
    );
  }
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
                className={cn(running > 0 && "text-spot-500-indigo")}
              />
              {running > 0 ? (
                <span
                  aria-hidden
                  className="absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-spot-500-indigo text-type-caption-2 font-medium text-on-dark tabular-nums"
                >
                  {running}
                </span>
              ) : null}
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
      {content}
    </Popover>
  );
}

/** The tray's popover: recent jobs with live progress. */
function JobList({
  jobs,
  isPending,
}: {
  jobs: JobSummary[];
  isPending: boolean;
}) {
  return (
    <>
      <h2 className="border-b border-stroke px-3 py-2 text-type-caption-1 font-medium">
        Jobs
      </h2>
      {isPending ? (
        <div className="flex flex-col gap-2 p-3" aria-label="Loading jobs">
          <Skeleton height="var(--spacing-row)" radius="var(--radius-sm)" />
          <Skeleton height="var(--spacing-row)" radius="var(--radius-sm)" />
        </div>
      ) : jobs.length === 0 ? (
        <p className="px-3 py-6 text-center text-type-caption-1 text-sub-text">
          No jobs yet
        </p>
      ) : (
        <ul className="max-h-96 overflow-y-auto" aria-live="polite">
          {jobs.map((job) => (
            <JobItem key={job.id} job={job} />
          ))}
        </ul>
      )}
    </>
  );
}

function JobItem({ job }: { job: JobSummary }) {
  const percent = progressPercent(job.latest);
  const line =
    job.status === "failed"
      ? job.error?.message
      : (job.latest?.message ?? <ShimmerText>Waiting to start…</ShimmerText>);
  return (
    <li className="flex flex-col gap-1.5 border-b border-stroke px-3 py-2.5 last:border-b-0">
      <div className="flex items-center gap-2">
        <JobStatusIcon status={job.status} />
        <span className="text-type-body-small font-medium">
          {jobTitle(job.kind)}
        </span>
        <span className="ml-auto text-type-caption-2 text-sub-text">
          {STATUS_LABELS[job.status]}
        </span>
      </div>
      {line ? (
        <p
          className={cn(
            "truncate text-type-caption-1 text-sub-text",
            job.status === "failed" && "text-text-danger",
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
      <time
        dateTime={job.created_at}
        className="text-type-caption-2 text-caption-1"
      >
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
        <StatusBuildingIcon aria-hidden className="size-4 text-sub-text" />
      );
    case "running":
      return (
        <LoadingIcon
          aria-hidden
          className="size-4 animate-spin text-spot-500-indigo motion-reduce:animate-spin-slow"
        />
      );
    case "succeeded":
      return <CheckIcon aria-hidden className="size-4 text-spot-500-green" />;
    default:
      return (
        <StatusFailedIcon aria-hidden className="size-4 text-spot-500-red" />
      );
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
