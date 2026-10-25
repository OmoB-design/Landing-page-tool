import { NextResponse } from "next/server";

import { WorkerError, changeBuildDesk } from "@/lib/api/worker";
import {
  badRequest,
  getApiSession,
  unauthorized,
} from "@/lib/auth/api-session";
import { deskActionSchemas, isDeskAction } from "@/lib/validators/desk";

/**
 * POST /api/builds/[buildId]/desk/[action]: one review desk change (D84), passed to the worker,
 * which checks the token, membership, the build's state and the page version, takes a snapshot
 * and saves. `action` is copy (edited sentences), status (approve / back to review), undo or
 * restore. Answers with the new desk; 409 when the page changed in another tab.
 */
export async function POST(
  request: Request,
  { params }: RouteContext<"/api/builds/[buildId]/desk/[action]">,
) {
  const session = await getApiSession();
  if (!session) return unauthorized();
  const { buildId, action } = await params;
  if (!isDeskAction(action)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const parsed = deskActionSchemas[action].safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message ?? "Invalid request.");
  }
  try {
    const desk = await changeBuildDesk(session.accessToken, buildId, action, {
      ...parsed.data,
      org_id: session.orgId,
    });
    return NextResponse.json(desk);
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
