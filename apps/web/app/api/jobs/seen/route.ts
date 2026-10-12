import { NextResponse } from "next/server";

import { getApiSession, unauthorized } from "@/lib/auth/api-session";

/**
 * Jobs → Mark all as read: remembers when the user last caught up with their org's jobs, on the
 * user's own auth record (`user_metadata.jobs_seen_at`), so it follows them across devices. Jobs
 * that finish later show as unread again.
 */
export async function POST() {
  const session = await getApiSession();
  if (!session) return unauthorized();
  const { error } = await session.supabase.auth.updateUser({
    data: { jobs_seen_at: new Date().toISOString() },
  });
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
