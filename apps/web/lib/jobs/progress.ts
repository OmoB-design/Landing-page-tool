import type { JobEvent, JobStatus } from "@/lib/validators/jobs";

/** Display names for job kinds (services/worker/app/jobs/registry.py has the same titles). */
const JOB_TITLES: Record<string, string> = {
  noop_demo: "Demo job",
};

export function jobTitle(kind: string): string {
  if (JOB_TITLES[kind]) return JOB_TITLES[kind];
  const words = kind.replaceAll("_", " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : "Job";
}

export function isActive(status: JobStatus): boolean {
  return status === "queued" || status === "running";
}

export const STATUS_LABELS: Record<JobStatus, string> = {
  queued: "Queued",
  running: "Running",
  succeeded: "Done",
  failed: "Failed",
  cancelled: "Cancelled",
};

/** Percent complete from a progress event's `data.step` / `data.total`, if it reports them. */
export function progressPercent(event: JobEvent | null): number | null {
  const step = event?.data?.step;
  const total = event?.data?.total;
  if (typeof step !== "number" || typeof total !== "number" || total <= 0) {
    return null;
  }
  return Math.min(100, Math.max(0, Math.round((step / total) * 100)));
}

/** Polling cadence (BUILD_SPEC §6.2): fast while something runs, slow when idle. */
export const POLL_ACTIVE_MS = 1500;
export const POLL_IDLE_MS = 15000;
