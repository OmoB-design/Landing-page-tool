import { NextResponse } from "next/server";
import { z } from "zod";

import { WorkerError, changeBatchOffer } from "@/lib/api/worker";
import {
  badRequest,
  getApiSession,
  unauthorized,
} from "@/lib/auth/api-session";

const bodySchema = z.object({
  offer_id: z.uuid().nullable(),
  build_ids: z.array(z.uuid()).min(1).max(40),
});

/** POST /api/builds/batch/[batchId]/offer (B7.3a): the offer change on a batch's chosen pages. */
export async function POST(
  request: Request,
  { params }: RouteContext<"/api/builds/batch/[batchId]/offer">,
) {
  const session = await getApiSession();
  if (!session) return unauthorized();
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return badRequest("Choose an offer and at least one page.");
  const { batchId } = await params;
  try {
    const started = await changeBatchOffer(session.accessToken, batchId, {
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
