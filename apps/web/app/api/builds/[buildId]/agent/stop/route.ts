import { NextResponse } from "next/server";

import { WorkerError, stopAgent } from "@/lib/api/worker";
import { getApiSession, unauthorized } from "@/lib/auth/api-session";

/**
 * POST /api/builds/[buildId]/agent/stop: Stop on Lander's running request (B3.1c, D106). The job
 * keeps what it did by its next step and finishes; 422 when nothing is running.
 */
export async function POST(
  _request: Request,
  { params }: RouteContext<"/api/builds/[buildId]/agent/stop">,
) {
  const session = await getApiSession();
  if (!session) return unauthorized();
  const { buildId } = await params;
  try {
    return NextResponse.json(
      await stopAgent(session.accessToken, session.orgId, buildId),
    );
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
