import { NextResponse } from "next/server";

import {
  badRequest,
  getApiSession,
  unauthorized,
} from "@/lib/auth/api-session";
import { markReadSchema } from "@/lib/validators/jobs";

/** Marks some (ids) or all of the user's unread notifications as read. */
export async function POST(request: Request) {
  const session = await getApiSession();
  if (!session) return unauthorized();
  const parsed = markReadSchema.safeParse(
    await request.json().catch(() => ({})),
  );
  if (!parsed.success) return badRequest("Invalid request.");

  let query = session.supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", session.userId)
    .is("read_at", null);
  if (parsed.data.ids) query = query.in("id", parsed.data.ids);
  const { error } = await query;
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
