import { NextResponse } from "next/server";

import { WorkerError, getQa, startQa } from "@/lib/api/worker";
import { getApiSession, unauthorized } from "@/lib/auth/api-session";

function failure(error: unknown) {
  if (error instanceof WorkerError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.status },
    );
  }
  throw error;
}

/** GET /api/builds/[buildId]/qa: the page's preview check (B3.3a): its screenshots, share image
 * and link preview, the version they show, and whether a check is under way. */
export async function GET(
  _request: Request,
  { params }: RouteContext<"/api/builds/[buildId]/qa">,
) {
  const session = await getApiSession();
  if (!session) return unauthorized();
  const { buildId } = await params;
  try {
    return NextResponse.json(
      await getQa(session.accessToken, session.orgId, buildId),
    );
  } catch (error) {
    return failure(error);
  }
}

/** POST /api/builds/[buildId]/qa: Refresh, a new check of the page as it is now (a job; free). */
export async function POST(
  _request: Request,
  { params }: RouteContext<"/api/builds/[buildId]/qa">,
) {
  const session = await getApiSession();
  if (!session) return unauthorized();
  const { buildId } = await params;
  try {
    return NextResponse.json(
      await startQa(session.accessToken, session.orgId, buildId),
    );
  } catch (error) {
    return failure(error);
  }
}
