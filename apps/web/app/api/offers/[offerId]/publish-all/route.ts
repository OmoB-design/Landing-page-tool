import { NextResponse } from "next/server";
import { z } from "zod";

import {
  WorkerError,
  getPublishAllPlan,
  startPublishAll,
} from "@/lib/api/worker";
import {
  badRequest,
  getApiSession,
  unauthorized,
} from "@/lib/auth/api-session";

const bodySchema = z.object({
  build_ids: z.array(z.uuid()).min(1).max(200),
  override: z.boolean().default(false),
});

function fail(error: unknown) {
  if (error instanceof WorkerError)
    return NextResponse.json(
      { error: error.message },
      { status: error.status },
    );
  throw error;
}

/** GET /api/offers/[offerId]/publish-all (B7.4, D149): what Approve and publish all would do
 * with each page selling the offer. */
export async function GET(
  _request: Request,
  { params }: RouteContext<"/api/offers/[offerId]/publish-all">,
) {
  const session = await getApiSession();
  if (!session) return unauthorized();
  const { offerId } = await params;
  try {
    return NextResponse.json(
      await getPublishAllPlan(session.accessToken, session.orgId, {
        kind: "offer",
        id: offerId,
      }),
    );
  } catch (error) {
    return fail(error);
  }
}

/** POST: approves the chosen pages and puts them live again where they were live. */
export async function POST(
  request: Request,
  { params }: RouteContext<"/api/offers/[offerId]/publish-all">,
) {
  const session = await getApiSession();
  if (!session) return unauthorized();
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return badRequest("Choose at least one page.");
  const { offerId } = await params;
  try {
    return NextResponse.json(
      await startPublishAll(
        session.accessToken,
        { kind: "offer", id: offerId },
        { org_id: session.orgId, ...parsed.data },
      ),
      { status: 202 },
    );
  } catch (error) {
    return fail(error);
  }
}
