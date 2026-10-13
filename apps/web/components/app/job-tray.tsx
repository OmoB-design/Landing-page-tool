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
import { ShimmerText } from "@/components/ui/shimmer-loader";
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
import { useJobs, useMarkJobsSeen } from "@/lib/queries/jobs";
import { useHydrated } from "@/lib/use-hydrated";
import { notificationKeys } from "@/lib/queries/notifications";
import { cn } from "@/lib/utils";
import type { JobStatus, JobSummary } from "@/lib/validators/jobs";

import {
  HEADER_POPOVER,
  HEADER_POPOVER_TITLE,
  POPOVER_FOOTER,
  POPOVER_FOOTER_ACTION,
  PopoverScroll,
} from "./header-popover";
import { toast } from "./toaster";
import { SkeletonMark, SkeletonText } from "./skeletons";

/** Job toasts for your own jobs, kept running from the sidebar so they work on every page. */
export function JobToasts({ userId }: { userId: string }) {
  const { data } = useJobs();
  useJobToasts(data?.jobs ?? [], userId);
  return null;
}

/**
 * Jobs in the page header (Figma: Icon/Job — a 16 px icon in a 32 px box): a blue dot while jobs
 * run or any finished since you last marked them read, and a popover (Figma: Jobs, built like
 * Notis) of recent jobs, each with its status, live progress while it runs, and when it started,
 * over a "Mark all as read" footer.
 */
export function JobTray() {
  const { data, isPending } = useJobs();
  const markSeen = useMarkJobsSeen();
  const hydrated = useHydrated();
  const jobs = data?.jobs ?? [];
  const running = jobs.filter((job) => isActive(job.status)).length;
  const seenAt = data?.seenAt ? Date.parse(data.seenAt) : 0;
  const unread = jobs.filter(
    (job) =>
      !isActive(job.status) &&
      job.finished_at !== null &&
      Date.parse(job.finished_at) > seenAt,
  ).length;
  // Counts appear after hydration, like the dot (the server has no jobs data).
  const label = !hydrated
    ? "Jobs"
    : running > 0
      ? `Jobs, ${running} running`
      : unread > 0
        ? `Jobs, ${unread} unread`
        : "Jobs";
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
              {label !== "Jobs" ? (
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
          // Job rows in their shape while the list loads: status ring, title and state, started.
          <ul
            className="flex flex-col gap-0.5 px-2.5 py-3"
            aria-label="Loading jobs"
          >
            {[120, 96].map((width) => (
              <li key={width} aria-hidden className="flex items-start gap-0.5">
                <span className="flex pt-2">
                  <SkeletonMark size={12} round />
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-1 px-1 pt-1 pb-1.5 divider-b-half">
                  <div className="flex items-center justify-between gap-2">
                    <SkeletonText
                      className="text-type-caption-1"
                      width={width}
                    />
                    <SkeletonText className="text-type-caption-2" width={44} />
                  </div>
                  <SkeletonText className="text-type-caption-2" width={92} />
                </div>
              </li>
            ))}
          </ul>
        ) : jobs.length === 0 ? (
          <p className="px-3 py-4 text-type-caption-1 font-medium text-heading-05">
            No jobs yet
          </p>
        ) : (
          <PopoverScroll>
            <ul
              className="flex flex-col gap-0.5 px-2.5 py-3"
              aria-live="polite"
            >
              {jobs.map((job) => (
                <JobItem key={job.id} job={job} />
              ))}
            </ul>
          </PopoverScroll>
        )}
        <div className={POPOVER_FOOTER}>
          <button
            type="button"
            disabled={unread === 0}
            onClick={() => markSeen.mutate()}
            className={POPOVER_FOOTER_ACTION}
          >
            Mark all as read
          </button>
        </div>
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
