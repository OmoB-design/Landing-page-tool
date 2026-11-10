import { NextResponse } from "next/server";

import { WorkerError, duplicateBuild } from "@/lib/api/worker";
import { getApiSession, unauthorized } from "@/lib/auth/api-session";

/**
 * POST /api/builds/[buildId]/duplicate (B7.1, D144): a copy of a finished page as it is now, in
 * Needs review, nested under the family's first page. The worker checks the token, membership
 * and that the page is built; it costs nothing.
 */
export async function POST(
  _request: Request,
  { params }: RouteContext<"/api/builds/[buildId]/duplicate">,
) {
  const session = await getApiSession();
  if (!session) return unauthorized();
  const { buildId } = await params;
  try {
    const copy = await duplicateBuild(session.accessToken, buildId, {
      org_id: session.orgId,
    });
    return NextResponse.json(copy, { status: 201 });
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
