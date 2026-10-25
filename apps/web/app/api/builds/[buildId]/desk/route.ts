import { NextResponse } from "next/server";

import { WorkerError, getBuildDesk } from "@/lib/api/worker";
import { getApiSession, unauthorized } from "@/lib/auth/api-session";

/**
 * GET /api/builds/[buildId]/desk: the review desk as it is now, for the desk to catch up after
 * a redraft job finishes (D86). The worker checks the token and membership.
 */
export async function GET(
  _request: Request,
  { params }: RouteContext<"/api/builds/[buildId]/desk">,
) {
  const session = await getApiSession();
  if (!session) return unauthorized();
  const { buildId } = await params;
  try {
    return NextResponse.json(
      await getBuildDesk(session.accessToken, session.orgId, buildId),
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
