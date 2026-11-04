import { NextResponse } from "next/server";

import { WorkerError, getAgentThreads } from "@/lib/api/worker";
import { getApiSession, unauthorized } from "@/lib/auth/api-session";

/** GET /api/builds/[buildId]/agent/threads: the page's conversations with Lander (B3.1e). */
export async function GET(
  _request: Request,
  { params }: RouteContext<"/api/builds/[buildId]/agent/threads">,
) {
  const session = await getApiSession();
  if (!session) return unauthorized();
  const { buildId } = await params;
  try {
    const threads = await getAgentThreads(
      session.accessToken,
      session.orgId,
      buildId,
    );
    return NextResponse.json({ threads });
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
