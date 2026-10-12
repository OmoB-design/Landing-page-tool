import { NextResponse } from "next/server";

import { WorkerError, startWorkerJob } from "@/lib/api/worker";
import {
  badRequest,
  getApiSession,
  unauthorized,
} from "@/lib/auth/api-session";
import { JOB_COLUMNS, latestEventsByJob } from "@/lib/jobs/queries";
import { startJobSchema } from "@/lib/validators/jobs";

/**
 * Recent jobs of the current org, each with its latest progress event (jobs tray), and when the
 * user last marked jobs as read (`seenAt`, from their auth record; null if never).
 */
export async function GET() {
  const session = await getApiSession();
  if (!session) return unauthorized();

  const { data: jobs, error } = await session.supabase
    .from("jobs")
    .select(JOB_COLUMNS)
    .eq("org_id", session.orgId)
    .order("created_at", { ascending: false })
    .limit(10);
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  const latest = await latestEventsByJob(
    session.supabase,
    jobs.map((job) => job.id),
  );
  const {
    data: { session: auth },
  } = await session.supabase.auth.getSession();
  const seenAt = auth?.user.user_metadata?.jobs_seen_at;
  return NextResponse.json({
    jobs: jobs.map((job) => ({ ...job, latest: latest.get(job.id) ?? null })),
    seenAt: typeof seenAt === "string" ? seenAt : null,
  });
}

/** Starts a job in the current org through the worker (it checks the token and membership). */
export async function POST(request: Request) {
  const session = await getApiSession();
  if (!session) return unauthorized();

  const parsed = startJobSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) return badRequest("Invalid job request.");

  try {
    const { job, created } = await startWorkerJob(session.accessToken, {
      org_id: session.orgId,
      kind: parsed.data.kind,
      payload: parsed.data.payload,
    });
    return NextResponse.json({ job, created }, { status: created ? 201 : 200 });
  } catch (error) {
    if (error instanceof WorkerError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    throw error;
  }
}
