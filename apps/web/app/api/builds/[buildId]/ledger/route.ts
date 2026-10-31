import { NextResponse } from "next/server";

import { getApiSession, unauthorized } from "@/lib/auth/api-session";

/** GET /api/builds/[buildId]/ledger: the page's paid calls, oldest first (the Library). */
export async function GET(
  _request: Request,
  { params }: RouteContext<"/api/builds/[buildId]/ledger">,
) {
  const session = await getApiSession();
  if (!session) return unauthorized();
  const { buildId } = await params;
  const { data, error } = await session.supabase
    .from("ledger_entries")
    .select(
      "id, created_at, node, kind, provider, model, input_tokens, output_tokens, units, cost_usd",
    )
    .eq("org_id", session.orgId)
    .eq("build_id", buildId)
    .order("created_at")
    .limit(500);
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    entries: data.map((entry) => ({
      ...entry,
      units: entry.units === null ? null : Number(entry.units),
      cost_usd: entry.cost_usd === null ? null : Number(entry.cost_usd),
    })),
  });
}
