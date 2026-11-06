import { NextResponse } from "next/server";

import { WorkerError, startMatch } from "@/lib/api/worker";
import { getApiSession, unauthorized } from "@/lib/auth/api-session";

/**
 * POST /api/builds/[buildId]/images/match: Match product everywhere (B3.2c, D116). Answers with
 * the job; the pictures the product check found are recreated with the real product and go on
 * the page as one undoable change (free placeholders while images are in mock mode).
 */
export async function POST(
  _request: Request,
  { params }: RouteContext<"/api/builds/[buildId]/images/match">,
) {
  const session = await getApiSession();
  if (!session) return unauthorized();
  const { buildId } = await params;
  try {
    return NextResponse.json(
      await startMatch(session.accessToken, session.orgId, buildId),
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
