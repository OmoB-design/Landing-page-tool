import { NextResponse } from "next/server";

import { WorkerError, startClone } from "@/lib/api/worker";
import {
  badRequest,
  getApiSession,
  unauthorized,
} from "@/lib/auth/api-session";
import { cloneRequestSchema } from "@/lib/validators/clone";

/** POST /api/templates/clone: starts cloning a page by address or pasted HTML (B2.1). The
 * worker checks the clone terms and the workspace's clone flag. */
export async function POST(request: Request) {
  const session = await getApiSession();
  if (!session) return unauthorized();
  const parsed = cloneRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return badRequest(parsed.error.issues[0]?.message ?? "Invalid request.");
  try {
    return NextResponse.json(
      await startClone(session.accessToken, session.orgId, parsed.data),
      { status: 201 },
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
