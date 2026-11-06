import { NextResponse } from "next/server";

import { WorkerError, getBatch, setBatchFolder } from "@/lib/api/worker";
import { getApiSession, unauthorized } from "@/lib/auth/api-session";
import { batchFolderSchema } from "@/lib/validators/build";

/** GET /api/builds/batch/[batchId]: a batch's pages and how each is getting on (B3.5, D115); the
 * batch screen polls it while pages build. */
export async function GET(
  _request: Request,
  { params }: RouteContext<"/api/builds/batch/[batchId]">,
) {
  const session = await getApiSession();
  if (!session) return unauthorized();
  const { batchId } = await params;
  try {
    return NextResponse.json(
      await getBatch(session.accessToken, session.orgId, batchId),
    );
  } catch (error) {
    if (error instanceof WorkerError)
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    throw error;
  }
}

/** PATCH /api/builds/batch/[batchId]: colours the batch's folder for the whole workspace (B3.5b). */
export async function PATCH(
  request: Request,
  { params }: RouteContext<"/api/builds/batch/[batchId]">,
) {
  const session = await getApiSession();
  if (!session) return unauthorized();
  const parsed = batchFolderSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json(
      { error: "Pick blue, black, red or purple." },
      { status: 400 },
    );
  const { batchId } = await params;
  try {
    return NextResponse.json(
      await setBatchFolder(
        session.accessToken,
        session.orgId,
        batchId,
        parsed.data.folder_color,
      ),
    );
  } catch (error) {
    if (error instanceof WorkerError)
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    throw error;
  }
}
