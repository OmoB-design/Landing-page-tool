import { NextResponse } from "next/server";

import {
  WorkerError,
  removeThemeAccess,
  setThemeAccess,
} from "@/lib/api/worker";
import {
  badRequest,
  getApiSession,
  unauthorized,
} from "@/lib/auth/api-session";
import { themeAccessSchema } from "@/lib/validators/publishing";

function workerFailure(error: unknown) {
  if (error instanceof WorkerError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.status },
    );
  }
  throw error;
}

/**
 * POST /api/integrations/shopify/theme-access: a brand's store's Theme Access password (B4.2,
 * D121). The worker checks it with Shopify (it must list the store's themes) and keeps it in
 * Vault; owners and admins only. DELETE ?brand_id= removes it.
 */
export async function POST(request: Request) {
  const session = await getApiSession();
  if (!session) return unauthorized();
  const parsed = themeAccessSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message ?? "Invalid request.");
  }
  try {
    return NextResponse.json(
      await setThemeAccess(session.accessToken, {
        ...parsed.data,
        org_id: session.orgId,
      }),
    );
  } catch (error) {
    return workerFailure(error);
  }
}

export async function DELETE(request: Request) {
  const session = await getApiSession();
  if (!session) return unauthorized();
  const brandId = new URL(request.url).searchParams.get("brand_id");
  if (!brandId) return badRequest("Which brand's store?");
  try {
    return NextResponse.json(
      await removeThemeAccess(session.accessToken, session.orgId, brandId),
    );
  } catch (error) {
    return workerFailure(error);
  }
}
