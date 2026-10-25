import { NextResponse } from "next/server";

import { WorkerError, connectVercel, disconnectVercel } from "@/lib/api/worker";
import {
  badRequest,
  getApiSession,
  unauthorized,
} from "@/lib/auth/api-session";
import { vercelConnectSchema } from "@/lib/validators/publishing";

function workerFailure(error: unknown) {
  if (error instanceof WorkerError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.status },
    );
  }
  throw error;
}

/**
 * POST /api/integrations/vercel: connects the org's Vercel account (D87). The worker checks the
 * token with Vercel and stores it in Vault; owners and admins only. DELETE disconnects it.
 */
export async function POST(request: Request) {
  const session = await getApiSession();
  if (!session) return unauthorized();
  const parsed = vercelConnectSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message ?? "Invalid request.");
  }
  try {
    return NextResponse.json(
      await connectVercel(session.accessToken, {
        org_id: session.orgId,
        token: parsed.data.token,
        team_id: parsed.data.team_id || undefined,
      }),
    );
  } catch (error) {
    return workerFailure(error);
  }
}

export async function DELETE() {
  const session = await getApiSession();
  if (!session) return unauthorized();
  try {
    return NextResponse.json(
      await disconnectVercel(session.accessToken, session.orgId),
    );
  } catch (error) {
    return workerFailure(error);
  }
}
