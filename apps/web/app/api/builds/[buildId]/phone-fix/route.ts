import { NextResponse } from "next/server";

import { WorkerError, startPhoneFix } from "@/lib/api/worker";
import { getApiSession, unauthorized } from "@/lib/auth/api-session";

/** POST /api/builds/[buildId]/phone-fix: Fix for phone (B3.3b, D112). Claude writes phone-only CSS
 * from the page at 390 px and the phone check (a job; about 5 to 10 cents); the page stays
 * editable and the fixes land as one undoable change. */
export async function POST(
  _request: Request,
  { params }: RouteContext<"/api/builds/[buildId]/phone-fix">,
) {
  const session = await getApiSession();
  if (!session) return unauthorized();
  const { buildId } = await params;
  try {
    return NextResponse.json(
      await startPhoneFix(session.accessToken, session.orgId, buildId),
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
