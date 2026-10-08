import { NextResponse } from "next/server";

import { getApiSession, unauthorized } from "@/lib/auth/api-session";

/** The user's latest notifications and unread count (RLS: own rows only). */
export async function GET() {
  const session = await getApiSession();
  if (!session) return unauthorized();

  const [list, unread] = await Promise.all([
    session.supabase
      .from("notifications")
      .select("id, kind, title, body, read_at, created_at, job_id, build_id")
      .order("created_at", { ascending: false })
      .limit(20),
    session.supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .is("read_at", null),
  ]);
  const error = list.error ?? unread.error;
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    notifications: list.data,
    unread: unread.count ?? 0,
  });
}
