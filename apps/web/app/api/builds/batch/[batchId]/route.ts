import { NextResponse } from "next/server";

import { WorkerError, getBatch } from "@/lib/api/worker";
import { getApiSession, unauthorized } from "@/lib/auth/api-session";

/** GET /api/builds/batch/[batchId]: a batch's pages and how each is getting on (B3.5, D115); the
 * batch screen polls it while pages build. */
export async function GET(
  _request: Request,
  { params }: RouteContext<"/api/builds/batch/[batchId]">,
) {
  const session = await getApiSession();
  if (!session) return unauthorized();
  const { batchId } = await params;
  try {
    return NextResponse.json(
      await getBatch(session.accessToken, session.orgId, batchId),
    );
  } catch (error) {
    if (error instanceof WorkerError)
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    throw error;
  }
}
