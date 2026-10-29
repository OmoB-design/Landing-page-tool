import { NextResponse } from "next/server";
import { z } from "zod";

import { WorkerError, startUnpublish } from "@/lib/api/worker";
import {
  badRequest,
  getApiSession,
  unauthorized,
} from "@/lib/auth/api-session";

const unpublishSchema = z
  .object({ destination: z.enum(["vercel", "shopify_page"]).default("vercel") })
  .default({ destination: "vercel" });

/** POST /api/builds/[buildId]/unpublish: takes the page down from Vercel (D89), or removes its
 * draft from the brand's Shopify store (`{ "destination": "shopify_page" }`). */
export async function POST(
  request: Request,
  { params }: RouteContext<"/api/builds/[buildId]/unpublish">,
) {
  const session = await getApiSession();
  if (!session) return unauthorized();
  const { buildId } = await params;
  const text = await request.text();
  const parsed = unpublishSchema.safeParse(
    text ? (JSON.parse(text) as unknown) : undefined,
  );
  if (!parsed.success) return badRequest("Invalid unpublish request.");
  try {
    return NextResponse.json(
      await startUnpublish(
        session.accessToken,
        buildId,
        session.orgId,
        parsed.data.destination,
      ),
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
