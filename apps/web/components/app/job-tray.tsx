"use client";

import { useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNowStrict } from "date-fns";
import { useEffect, useRef } from "react";

import { LoadingIcon, StatusFailedIcon } from "@/components/ui/icons";
import {
  HeaderJobsIcon,
  JobDoneIcon,
  StepTodoIcon,
} from "@/components/ui/lp-icons";
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

// Figma: Jobs and Notification popovers — 280 px, 10 px corners, a 0.7 px stroke-strong outline
// and the inner edge shadow; white in light mode, the overlay colour in dark mode.
export const HEADER_POPOVER =
  "flex w-menu-header flex-col gap-1.5 overflow-hidden rounded-lg bg-surface-primary p-0 pb-1.5 shadow-edge ring-thin ring-stroke-strong dark:bg-overlay";
export const HEADER_POPOVER_TITLE =
  "divider-b-thin p-3 text-type-caption-2 font-medium text-heading-05";

/** Job toasts for your own jobs, kept running from the sidebar so they work on every page. */
export function JobToasts({ userId }: { userId: string }) {
  const { data } = useJobs();
  useJobToasts(data?.jobs ?? [], userId);
  return null;
}

/**
 * Jobs in the page header (Figma: Icon/Job — a 16 px icon in a 32 px box): a blue dot while jobs
 * run, and a popover (Figma: Jobs) of recent jobs, each with its status, live progress while it
 * runs, and when it started.
 */
export function JobTray() {
  const { data, isPending } = useJobs();
  const jobs = data?.jobs ?? [];
  const running = jobs.filter((job) => isActive(job.status)).length;
  const label = running > 0 ? `Jobs, ${running} running` : "Jobs";
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={label}
              className="relative flex size-8 items-center justify-center rounded-sm text-icon-system outline-none hover:bg-foreground-02 hover:text-icon-nav-active focus-visible:ring-2 focus-visible:ring-ring aria-expanded:bg-foreground-01 aria-expanded:text-icon-nav-active"
            >
              <HeaderJobsIcon className="size-4" />
              {running > 0 ? (
                <span
                  aria-hidden
                  data-dot
                  className="absolute top-2 left-4.5 size-1 rounded-full bg-spot-500-blue"
                />
              ) : null}
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" sideOffset={6} className={HEADER_POPOVER}>
        <h2 className={HEADER_POPOVER_TITLE}>Jobs</h2>
        {isPending ? (
          <div
            className="flex flex-col gap-2 px-3 pb-1.5"
            aria-label="Loading jobs"
          >
            <Skeleton height="var(--spacing-row)" radius="var(--radius-sm)" />
            <Skeleton height="var(--spacing-row)" radius="var(--radius-sm)" />
          </div>
        ) : jobs.length === 0 ? (
          <p className="px-3 py-4 text-type-caption-1 font-medium text-heading-05">
            No jobs yet
          </p>
        ) : (
          <ul
            className="flex max-h-96 flex-col gap-0.5 overflow-y-auto px-2.5 pb-1.5"
            aria-live="polite"
          >
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
  return (
    <li className="flex items-start gap-0.5">
      <span className="flex pt-2">
        <JobStatusIcon status={job.status} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1 px-1 pt-1 pb-1.5 divider-b-half">
        <div className="flex items-start justify-between gap-2 text-heading-01">
          <span className="truncate text-type-caption-1 font-medium">
            {jobTitle(job.kind)}
          </span>
          <span
            className={cn(
              "shrink-0 text-type-caption-2",
              job.status === "failed" && "text-text-danger",
            )}
          >
            {STATUS_LABELS[job.status]}
          </span>
        </div>
        {job.status === "failed" && job.error?.message ? (
          <p className="truncate text-type-caption-2 text-text-danger">
            {job.error.message}
          </p>
        ) : isActive(job.status) ? (
          <>
            <p className="truncate text-type-caption-2 text-heading-05">
              {job.latest?.message ?? (
                <ShimmerText>Waiting to start…</ShimmerText>
              )}
            </p>
            <Progress
              value={percent ?? 0}
              aria-label={`${jobTitle(job.kind)} progress`}
            />
          </>
        ) : null}
        <time
          dateTime={job.created_at}
          className="text-type-caption-2 text-heading-05"
        >
          Started{" "}
          {formatDistanceToNowStrict(new Date(job.created_at), {
            addSuffix: true,
          })}
        </time>
      </div>
    </li>
  );
}

function JobStatusIcon({ status }: { status: JobStatus }) {
  switch (status) {
    case "succeeded":
      return <JobDoneIcon className="size-2.5" />;
    case "running":
      return (
        <LoadingIcon
          aria-hidden
          className="size-2.5 animate-spin text-spot-500-blue motion-reduce:animate-spin-slow"
        />
      );
    case "queued":
      return <StepTodoIcon className="size-2.5 text-stroke-input-hover" />;
    default:
      return (
        <StatusFailedIcon aria-hidden className="size-2.5 text-text-danger" />
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
