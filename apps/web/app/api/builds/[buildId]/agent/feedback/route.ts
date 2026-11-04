import { NextResponse } from "next/server";

import { WorkerError, rateAgentReply } from "@/lib/api/worker";
import {
  badRequest,
  getApiSession,
  unauthorized,
} from "@/lib/auth/api-session";
import { agentRateSchema } from "@/lib/validators/agent";

/**
 * POST /api/builds/[buildId]/agent/feedback: a thumbs up or down on one of Lander's replies (by
 * the job that wrote it), with quick reasons and a note for a thumbs down, or taking it back
 * (B3.1e).
 */
export async function POST(
  request: Request,
  { params }: RouteContext<"/api/builds/[buildId]/agent/feedback">,
) {
  const session = await getApiSession();
  if (!session) return unauthorized();
  const { buildId } = await params;
  const parsed = agentRateSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message ?? "Invalid request.");
  }
  try {
    return NextResponse.json(
      await rateAgentReply(
        session.accessToken,
        session.orgId,
        buildId,
        parsed.data,
      ),
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
