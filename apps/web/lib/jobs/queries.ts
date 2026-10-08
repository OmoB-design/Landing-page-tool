import type { createClient } from "@/lib/supabase/server";
import type { JobEvent } from "@/lib/validators/jobs";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

/** Job columns the UI reads (RLS limits rows to the user's orgs). */
export const JOB_COLUMNS =
  "id, kind, status, attempts, max_attempts, result, error, created_by, created_at, started_at, finished_at";

/** The newest event of each job, in one query. */
export async function latestEventsByJob(
  supabase: ServerClient,
  jobIds: string[],
): Promise<Map<string, JobEvent>> {
  const latest = new Map<string, JobEvent>();
  if (jobIds.length === 0) return latest;
  const { data, error } = await supabase
    .from("job_events")
    .select("id, job_id, ts, level, message, data")
    .in("job_id", jobIds)
    .order("id", { ascending: false })
    .limit(200);
  if (error) throw new Error(`Could not load job progress: ${error.message}`);
  for (const { job_id, ...event } of data) {
    if (!latest.has(job_id)) latest.set(job_id, event as JobEvent);
  }
  return latest;
}
