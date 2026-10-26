import { NextResponse } from "next/server";

import { WorkerError, startUnpublish } from "@/lib/api/worker";
import { getApiSession, unauthorized } from "@/lib/auth/api-session";

/** POST /api/builds/[buildId]/unpublish: takes the page down from Vercel (D89). */
export async function POST(
  _request: Request,
  { params }: RouteContext<"/api/builds/[buildId]/unpublish">,
) {
  const session = await getApiSession();
  if (!session) return unauthorized();
  const { buildId } = await params;
  try {
    return NextResponse.json(
      await startUnpublish(session.accessToken, buildId, session.orgId),
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
