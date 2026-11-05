import { NextResponse } from "next/server";

import { WorkerError, changeImage } from "@/lib/api/worker";
import {
  badRequest,
  getApiSession,
  unauthorized,
} from "@/lib/auth/api-session";
import { imageActionSchemas, isImageAction } from "@/lib/validators/images";

/**
 * POST /api/builds/[buildId]/images/[number]/[action]: one image studio change (B3.2a), passed to
 * the worker: replace (a product photo, another image on the page, or an upload), adjust (shape,
 * fit, focus, alt text) or restore (an earlier version). Each is one undoable desk change; answers
 * with the new desk, 409 when the page changed in another tab.
 */
export async function POST(
  request: Request,
  { params }: RouteContext<"/api/builds/[buildId]/images/[number]/[action]">,
) {
  const session = await getApiSession();
  if (!session) return unauthorized();
  const { buildId, number, action } = await params;
  if (!isImageAction(action) || !/^\d{1,6}$/.test(number)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const parsed = imageActionSchemas[action].safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message ?? "Invalid request.");
  }
  try {
    const desk = await changeImage(
      session.accessToken,
      buildId,
      Number(number),
      action,
      { ...parsed.data, org_id: session.orgId },
    );
    return NextResponse.json(desk);
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
