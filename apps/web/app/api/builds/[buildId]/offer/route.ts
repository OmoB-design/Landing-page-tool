import { NextResponse } from "next/server";
import { z } from "zod";

import { WorkerError, changeOffer } from "@/lib/api/worker";
import {
  badRequest,
  getApiSession,
  unauthorized,
} from "@/lib/auth/api-session";

const bodySchema = z.object({
  offer_id: z.uuid().nullable(),
  base_version: z.number().int().min(1),
});

/**
 * POST /api/builds/[buildId]/offer (B7.3a, D147): queues changing the page's offer (null: no
 * offer) as one desk change; the worker checks the page, its version and the offer.
 */
export async function POST(
  request: Request,
  { params }: RouteContext<"/api/builds/[buildId]/offer">,
) {
  const session = await getApiSession();
  if (!session) return unauthorized();
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return badRequest("Choose an offer.");
  const { buildId } = await params;
  try {
    const started = await changeOffer(session.accessToken, buildId, {
      org_id: session.orgId,
      ...parsed.data,
    });
    return NextResponse.json(started, { status: 202 });
  } catch (error) {
    if (error instanceof WorkerError)
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    throw error;
  }
}
