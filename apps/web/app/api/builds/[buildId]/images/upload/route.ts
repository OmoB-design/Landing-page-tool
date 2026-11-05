import { NextResponse } from "next/server";

import { WorkerError, uploadImage } from "@/lib/api/worker";
import {
  badRequest,
  getApiSession,
  unauthorized,
} from "@/lib/auth/api-session";
import { imageUploadSchema } from "@/lib/validators/images";

/**
 * POST /api/builds/[buildId]/images/upload: a picture from the user's computer (B3.2a), sized
 * down in the browser first (lib/pages/images). The worker checks it (PNG, JPEG or WebP, up to
 * 8 MB) and stores it as one of the workspace's assets; the image studio then puts it on the page.
 */
export async function POST(
  request: Request,
  { params }: RouteContext<"/api/builds/[buildId]/images/upload">,
) {
  const session = await getApiSession();
  if (!session) return unauthorized();
  const { buildId } = await params;
  const parsed = imageUploadSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message ?? "Invalid request.");
  }
  try {
    const stored = await uploadImage(
      session.accessToken,
      session.orgId,
      buildId,
      parsed.data.data_url,
    );
    return NextResponse.json(stored);
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
