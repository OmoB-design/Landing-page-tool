import { NextResponse } from "next/server";

import { WorkerError } from "@/lib/api/worker";
import { publicBase } from "@/lib/links/public-base";
import type { MembersAnswer, MembersState } from "@/lib/validators/members";

/** The members state with each invite's link (`/invite/<token>` on the public domain). */
export function withLinks(
  state: MembersState,
  request: Request,
): MembersAnswer {
  const base = publicBase(request);
  return {
    ...state,
    invites: state.invites.map((invite) => ({
      ...invite,
      url: `${base}/invite/${encodeURIComponent(invite.token)}`,
    })),
  };
}

/** Runs a worker call for a members route: its answer with links, or the worker's error. */
export async function membersAnswer(
  request: Request,
  call: () => Promise<MembersState | null>,
): Promise<NextResponse> {
  try {
    const state = await call();
    return NextResponse.json(state ? withLinks(state, request) : null);
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
