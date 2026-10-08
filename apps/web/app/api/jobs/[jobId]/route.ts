import { NextResponse } from "next/server";

import { getApiSession, unauthorized } from "@/lib/auth/api-session";
import { JOB_COLUMNS } from "@/lib/jobs/queries";

const EVENT_LIMIT = 50;

/** One job of the current org with its latest events, oldest first (useJob polls this). */
export async function GET(
  _request: Request,
  { params }: RouteContext<"/api/jobs/[jobId]">,
) {
  const session = await getApiSession();
  if (!session) return unauthorized();
  const { jobId } = await params;

  const { data: job, error } = await session.supabase
    .from("jobs")
    .select(JOB_COLUMNS)
    .eq("id", jobId)
    .eq("org_id", session.orgId)
    .maybeSingle();
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  if (!job)
    return NextResponse.json({ error: "Job not found." }, { status: 404 });

  const { data: events, error: eventsError } = await session.supabase
    .from("job_events")
    .select("id, ts, level, message, data")
    .eq("job_id", jobId)
    .order("id", { ascending: false })
    .limit(EVENT_LIMIT);
  if (eventsError)
    return NextResponse.json({ error: eventsError.message }, { status: 500 });

  return NextResponse.json({ ...job, events: events.reverse() });
}
