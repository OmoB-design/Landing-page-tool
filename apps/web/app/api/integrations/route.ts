import { NextResponse } from "next/server";

import { WorkerError, getIntegrations } from "@/lib/api/worker";
import { getApiSession, unauthorized } from "@/lib/auth/api-session";

/** GET /api/integrations: the org's Vercel connection (never the token) and testing switch. */
export async function GET() {
  const session = await getApiSession();
  if (!session) return unauthorized();
  try {
    return NextResponse.json(
      await getIntegrations(session.accessToken, session.orgId),
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
