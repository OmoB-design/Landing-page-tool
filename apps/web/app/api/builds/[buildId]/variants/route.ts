import { NextResponse } from "next/server";
import { z } from "zod";

import { WorkerError, makeVariants } from "@/lib/api/worker";
import {
  badRequest,
  getApiSession,
  unauthorized,
} from "@/lib/auth/api-session";

const bodySchema = z.object({ offer_ids: z.array(z.uuid()).min(1).max(10) });

/** POST /api/builds/[buildId]/variants (B7.3a): one copy of the page per offer, each changed to
 * its offer. */
export async function POST(
  request: Request,
  { params }: RouteContext<"/api/builds/[buildId]/variants">,
) {
  const session = await getApiSession();
  if (!session) return unauthorized();
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return badRequest("Choose at least one offer.");
  const { buildId } = await params;
  try {
    const made = await makeVariants(session.accessToken, buildId, {
      org_id: session.orgId,
      ...parsed.data,
    });
    return NextResponse.json(made, { status: 201 });
  } catch (error) {
    if (error instanceof WorkerError)
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    throw error;
  }
}
