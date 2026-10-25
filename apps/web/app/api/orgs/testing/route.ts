import { NextResponse } from "next/server";

import { WorkerError, setTestingSwitch } from "@/lib/api/worker";
import {
  badRequest,
  getApiSession,
  unauthorized,
} from "@/lib/auth/api-session";
import { testingSwitchSchema } from "@/lib/validators/publishing";

/** POST /api/orgs/testing: the owner's switch for publishing pages with placeholder images. */
export async function POST(request: Request) {
  const session = await getApiSession();
  if (!session) return unauthorized();
  const parsed = testingSwitchSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) return badRequest("Invalid request.");
  try {
    return NextResponse.json(
      await setTestingSwitch(
        session.accessToken,
        session.orgId,
        parsed.data.allow_placeholder_publish,
      ),
    );
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
