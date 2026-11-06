import { NextResponse } from "next/server";

import {
  WorkerError,
  getShare,
  makeShare,
  turnOffShare,
} from "@/lib/api/worker";
import { getApiSession, unauthorized } from "@/lib/auth/api-session";
import type { ShareAnswer, ShareState } from "@/lib/validators/share";

/**
 * /api/builds/[buildId]/share: the page's client review link (B3.6, D119). GET reads it, POST makes
 * it (or gives the live one; the page needs an approved version), DELETE turns it off. The answer
 * carries the link's address on the production domain: Vercel keeps that one public while its
 * login covers previews and generated addresses, so a link copied from anywhere opens for the
 * client. Locally it's this server's own address.
 */
function base(request: Request): string {
  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return production ? `https://${production}` : new URL(request.url).origin;
}

async function answer(
  request: Request,
  { params }: RouteContext<"/api/builds/[buildId]/share">,
  call: typeof getShare,
) {
  const session = await getApiSession();
  if (!session) return unauthorized();
  const { buildId } = await params;
  try {
    const state: ShareState = await call(
      session.accessToken,
      session.orgId,
      buildId,
    );
    const body: ShareAnswer = {
      ...state,
      url: state.link
        ? `${base(request)}/review/${encodeURIComponent(state.link.token)}`
        : null,
    };
    return NextResponse.json(body);
  } catch (error) {
    if (error instanceof WorkerError)
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    throw error;
  }
}

export function GET(
  request: Request,
  context: RouteContext<"/api/builds/[buildId]/share">,
) {
  return answer(request, context, getShare);
}

export function POST(
  request: Request,
  context: RouteContext<"/api/builds/[buildId]/share">,
) {
  return answer(request, context, makeShare);
}

export function DELETE(
  request: Request,
  context: RouteContext<"/api/builds/[buildId]/share">,
) {
  return answer(request, context, turnOffShare);
}
