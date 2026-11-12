import { NextResponse } from "next/server";
import { z } from "zod";

import { WorkerError, getOfferPages, startOfferPages } from "@/lib/api/worker";
import {
  badRequest,
  getApiSession,
  unauthorized,
} from "@/lib/auth/api-session";

const bodySchema = z.object({
  build_ids: z.array(z.uuid()).min(1).max(200),
});

function fail(error: unknown) {
  if (error instanceof WorkerError)
    return NextResponse.json(
      { error: error.message },
      { status: error.status },
    );
  throw error;
}

/** GET /api/offers/[offerId]/pages (B7.4, D149): the pages selling the offer, out of date or
 * not, and the latest offer change on each. */
export async function GET(
  _request: Request,
  { params }: RouteContext<"/api/offers/[offerId]/pages">,
) {
  const session = await getApiSession();
  if (!session) return unauthorized();
  const { offerId } = await params;
  try {
    return NextResponse.json(
      await getOfferPages(session.accessToken, session.orgId, offerId),
    );
  } catch (error) {
    return fail(error);
  }
}

/** POST: updates the chosen pages to the offer as it is now, each on its own (a job per page). */
export async function POST(
  request: Request,
  { params }: RouteContext<"/api/offers/[offerId]/pages">,
) {
  const session = await getApiSession();
  if (!session) return unauthorized();
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return badRequest("Choose at least one page.");
  const { offerId } = await params;
  try {
    return NextResponse.json(
      await startOfferPages(session.accessToken, offerId, {
        org_id: session.orgId,
        ...parsed.data,
      }),
      { status: 202 },
    );
  } catch (error) {
    return fail(error);
  }
}
