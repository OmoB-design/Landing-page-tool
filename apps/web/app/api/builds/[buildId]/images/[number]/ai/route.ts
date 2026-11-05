import { NextResponse } from "next/server";

import { WorkerError, startImageAi } from "@/lib/api/worker";
import {
  badRequest,
  getApiSession,
  unauthorized,
} from "@/lib/auth/api-session";
import { imageAiSchema } from "@/lib/validators/images";

/**
 * POST /api/builds/[buildId]/images/[number]/ai: a new picture for the image, or the one it shows
 * edited, with AI (B3.2b, D110). Answers with the job; the picture goes on the page as one
 * undoable change when it's ready (free placeholders while images are in mock mode).
 */
export async function POST(
  request: Request,
  { params }: RouteContext<"/api/builds/[buildId]/images/[number]/ai">,
) {
  const session = await getApiSession();
  if (!session) return unauthorized();
  const { buildId, number } = await params;
  if (!/^\d{1,6}$/.test(number)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const parsed = imageAiSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message ?? "Invalid request.");
  }
  try {
    const job = await startImageAi(
      session.accessToken,
      session.orgId,
      buildId,
      Number(number),
      parsed.data,
    );
    return NextResponse.json(job);
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
