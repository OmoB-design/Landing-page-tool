import { NextResponse } from "next/server";

import { WorkerError, getBuildParts } from "@/lib/api/worker";
import { getApiSession, unauthorized } from "@/lib/auth/api-session";

/**
 * GET /api/builds/[buildId]/parts: each section's parts (texts, pictures, videos) for the page
 * editor's tree (B4.4, D123), named as Shopify's theme editor names them.
 */
export async function GET(
  _request: Request,
  { params }: RouteContext<"/api/builds/[buildId]/parts">,
) {
  const session = await getApiSession();
  if (!session) return unauthorized();
  const { buildId } = await params;
  try {
    return NextResponse.json(
      await getBuildParts(session.accessToken, session.orgId, buildId),
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
