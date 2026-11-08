import { NextResponse, type NextRequest } from "next/server";

import { safeNext } from "@/lib/auth/next";
import { createClient } from "@/lib/supabase/server";

/** Magic links and email confirmations land here with a one-time code (PKCE). */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = safeNext(request.nextUrl.searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, request.url));
  }

  return NextResponse.redirect(new URL("/auth/error", request.url));
}
