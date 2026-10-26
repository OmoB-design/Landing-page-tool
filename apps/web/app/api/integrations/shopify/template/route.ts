import { NextResponse } from "next/server";

import { WorkerError, getShopifyTemplate } from "@/lib/api/worker";
import { getApiSession, unauthorized } from "@/lib/auth/api-session";

/**
 * GET /api/integrations/shopify/template: the full-width template's two files, for the store
 * owner to add to their theme once (Shopify refuses theme writes to apps without an exemption).
 */
export async function GET() {
  const session = await getApiSession();
  if (!session) return unauthorized();
  try {
    return NextResponse.json(await getShopifyTemplate(session.accessToken));
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
