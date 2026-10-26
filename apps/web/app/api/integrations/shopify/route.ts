import { NextResponse } from "next/server";

import {
  WorkerError,
  connectShopify,
  disconnectShopify,
} from "@/lib/api/worker";
import {
  badRequest,
  getApiSession,
  unauthorized,
} from "@/lib/auth/api-session";
import { shopifyConnectSchema } from "@/lib/validators/publishing";

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
 * POST /api/integrations/shopify: connects a brand's Shopify store (D90). The worker checks the
 * store owner's app with Shopify and keeps its secret in Vault; owners and admins only.
 * DELETE ?brand_id= disconnects it.
 */
export async function POST(request: Request) {
  const session = await getApiSession();
  if (!session) return unauthorized();
  const parsed = shopifyConnectSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message ?? "Invalid request.");
  }
  try {
    return NextResponse.json(
      await connectShopify(session.accessToken, {
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
      await disconnectShopify(session.accessToken, session.orgId, brandId),
    );
  } catch (error) {
    return workerFailure(error);
  }
}
