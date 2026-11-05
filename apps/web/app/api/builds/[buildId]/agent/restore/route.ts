import { NextResponse } from "next/server";
import { z } from "zod";

import { WorkerError, restoreAgentPage } from "@/lib/api/worker";
import {
  badRequest,
  getApiSession,
  unauthorized,
} from "@/lib/auth/api-session";

const bodySchema = z.object({
  base_version: z.number().int().min(1),
  message_id: z.string().uuid(),
});

/**
 * POST /api/builds/[buildId]/agent/restore: Restore page to here (owner, 2026-11-05). The page goes
 * back to how it was when one of Lander's requests was sent, as one undoable change. Answers with
 * the new desk; 422 when the page is already as it was or that version isn't kept any more.
 */
export async function POST(
  request: Request,
  { params }: RouteContext<"/api/builds/[buildId]/agent/restore">,
) {
  const session = await getApiSession();
  if (!session) return unauthorized();
  const { buildId } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message ?? "Invalid request.");
  }
  try {
    const desk = await restoreAgentPage(
      session.accessToken,
      session.orgId,
      buildId,
      parsed.data,
    );
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
