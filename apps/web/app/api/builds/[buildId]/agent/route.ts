import { NextResponse } from "next/server";

import { WorkerError, getAgentThread, startAgent } from "@/lib/api/worker";
import {
  badRequest,
  getApiSession,
  unauthorized,
} from "@/lib/auth/api-session";
import { agentRequestSchema } from "@/lib/validators/agent";

function workerError(error: unknown) {
  if (error instanceof WorkerError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.status },
    );
  }
  throw error;
}

/**
 * GET /api/builds/[buildId]/agent?thread=<id>: the conversation with Lander about the page (the
 * one named, or the newest), so the editor shows it again after a reload (B3.1c, D106).
 */
export async function GET(
  request: Request,
  { params }: RouteContext<"/api/builds/[buildId]/agent">,
) {
  const session = await getApiSession();
  if (!session) return unauthorized();
  const { buildId } = await params;
  const thread = new URL(request.url).searchParams.get("thread");
  try {
    return NextResponse.json(
      await getAgentThread(session.accessToken, session.orgId, buildId, thread),
    );
  } catch (error) {
    return workerError(error);
  }
}

/**
 * POST /api/builds/[buildId]/agent: a request to Lander. The worker checks the page version and
 * that nothing else is rewriting the page, saves the request in its conversation and queues the
 * job (a long job, never run here). Answers with the desk (showing Lander's job running), the
 * conversation's id and the job's.
 */
export async function POST(
  request: Request,
  { params }: RouteContext<"/api/builds/[buildId]/agent">,
) {
  const session = await getApiSession();
  if (!session) return unauthorized();
  const { buildId } = await params;
  const parsed = agentRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message ?? "Invalid request.");
  }
  try {
    return NextResponse.json(
      await startAgent(
        session.accessToken,
        session.orgId,
        buildId,
        parsed.data,
      ),
    );
  } catch (error) {
    return workerError(error);
  }
}
