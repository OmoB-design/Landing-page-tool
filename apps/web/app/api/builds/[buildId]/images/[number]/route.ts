import { NextResponse } from "next/server";

import { WorkerError, getImageStudio } from "@/lib/api/worker";
import { getApiSession, unauthorized } from "@/lib/auth/api-session";

/** GET /api/builds/[buildId]/images/[number]: one image of the page for the image studio
 * (B3.2a): its details, what it can become, and its last five versions. */
export async function GET(
  _request: Request,
  { params }: RouteContext<"/api/builds/[buildId]/images/[number]">,
) {
  const session = await getApiSession();
  if (!session) return unauthorized();
  const { buildId, number } = await params;
  if (!/^\d{1,6}$/.test(number)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  try {
    const studio = await getImageStudio(
      session.accessToken,
      session.orgId,
      buildId,
      Number(number),
    );
    return NextResponse.json(studio);
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
