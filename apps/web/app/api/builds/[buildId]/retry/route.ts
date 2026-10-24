import { NextResponse } from "next/server";

import { WorkerError, retryBuild } from "@/lib/api/worker";
import { getApiSession, unauthorized } from "@/lib/auth/api-session";

/**
 * POST /api/builds/[buildId]/retry: queues a failed build again through the worker (it checks the
 * token and membership, and that the build failed). The build picks up after its last finished
 * step, so only what failed is run (and paid for) again.
 */
export async function POST(
  _request: Request,
  { params }: RouteContext<"/api/builds/[buildId]/retry">,
) {
  const session = await getApiSession();
  if (!session) return unauthorized();
  const { buildId } = await params;
  try {
    const { build, job } = await retryBuild(session.accessToken, buildId, {
      org_id: session.orgId,
    });
    return NextResponse.json({ build, job }, { status: 201 });
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
