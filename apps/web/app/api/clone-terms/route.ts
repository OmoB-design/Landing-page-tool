import { NextResponse } from "next/server";

import { WorkerError, acceptCloneTerms, getCloneTerms } from "@/lib/api/worker";
import { getApiSession, unauthorized } from "@/lib/auth/api-session";

function failed(error: unknown) {
  if (error instanceof WorkerError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.status },
    );
  }
  throw error;
}

/** GET /api/clone-terms: whether the workspace has accepted the clone terms (BUILD_SPEC §3). */
export async function GET() {
  const session = await getApiSession();
  if (!session) return unauthorized();
  try {
    return NextResponse.json(
      await getCloneTerms(session.accessToken, session.orgId),
    );
  } catch (error) {
    return failed(error);
  }
}

/** POST /api/clone-terms: accepts them for the workspace (owners and admins; D33). */
export async function POST() {
  const session = await getApiSession();
  if (!session) return unauthorized();
  try {
    return NextResponse.json(
      await acceptCloneTerms(session.accessToken, session.orgId),
    );
  } catch (error) {
    return failed(error);
  }
}
