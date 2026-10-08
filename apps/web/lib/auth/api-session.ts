import { NextResponse } from "next/server";

import { loadMembership } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

/** What a Route Handler needs to act for the signed-in user. */
export type ApiSession = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  orgId: string;
  /** Forwarded to the worker, which verifies it itself (DECISIONS.md D43). */
  accessToken: string;
};

/** The signed-in user for a Route Handler, or null (respond with `unauthorized()`). */
export async function getApiSession(): Promise<ApiSession | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims) return null;
  // getClaims() verified the token above; getSession() only reads it from the cookie.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return null;
  const { currentOrg } = await loadMembership(supabase, claims.sub);
  return {
    supabase,
    userId: claims.sub,
    orgId: currentOrg.id,
    accessToken: session.access_token,
  };
}

export function unauthorized() {
  return NextResponse.json({ error: "Sign in required." }, { status: 401 });
}

export function badRequest(error: string) {
  return NextResponse.json({ error }, { status: 400 });
}
