import { NextResponse } from "next/server";

import { WorkerError, startPublish } from "@/lib/api/worker";
import {
  badRequest,
  getApiSession,
  unauthorized,
} from "@/lib/auth/api-session";
import { publishSchema } from "@/lib/validators/publishing";

/**
 * POST /api/builds/[buildId]/publish: queues a publish to Vercel (D87). The worker checks the
 * page's status and version and the gate; `override` passes the gate's reasons (recorded).
 */
export async function POST(
  request: Request,
  { params }: RouteContext<"/api/builds/[buildId]/publish">,
) {
  const session = await getApiSession();
  if (!session) return unauthorized();
  const { buildId } = await params;
  const parsed = publishSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) return badRequest("Invalid request.");
  try {
    return NextResponse.json(
      await startPublish(session.accessToken, buildId, {
        ...parsed.data,
        org_id: session.orgId,
      }),
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
