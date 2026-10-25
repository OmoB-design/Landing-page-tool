import { NextResponse } from "next/server";

import { WorkerError, getPublishing } from "@/lib/api/worker";
import { getApiSession, unauthorized } from "@/lib/auth/api-session";

/** GET /api/builds/[buildId]/publishing: the gate, the live page, a publish in progress, the history. */
export async function GET(
  _request: Request,
  { params }: RouteContext<"/api/builds/[buildId]/publishing">,
) {
  const session = await getApiSession();
  if (!session) return unauthorized();
  const { buildId } = await params;
  try {
    return NextResponse.json(
      await getPublishing(session.accessToken, session.orgId, buildId),
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
