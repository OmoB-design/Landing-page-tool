import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

export type SessionOrg = {
  id: string;
  name: string;
  role: Database["public"]["Enums"]["member_role"];
};

export type SessionContext = {
  user: { id: string; email: string; displayName: string };
  orgs: SessionOrg[];
  /** The org the user is working in: profiles.default_org_id, or their first org. */
  currentOrg: SessionOrg;
};

/**
 * The signed-in user, their orgs and their current org. Request-time only, and loaded once per
 * request however many components ask for it. Redirects to /sign-in when there is no session.
 */
export const getSessionContext = cache(async (): Promise<SessionContext> => {
  // The Supabase client checks token expiry against the clock, which Cache Components does not
  // allow during prerendering.
  await connection();
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims) redirect("/sign-in");

  const [profileResult, membershipsResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name, default_org_id")
      .eq("user_id", claims.sub)
      .maybeSingle(),
    supabase
      .from("org_members")
      .select("role, orgs(id, name)")
      .eq("user_id", claims.sub),
  ]);
  if (profileResult.error)
    throw new Error(
      `Could not load your profile: ${profileResult.error.message}`,
    );
  if (membershipsResult.error) {
    throw new Error(
      `Could not load your organisations: ${membershipsResult.error.message}`,
    );
  }

  const orgs = membershipsResult.data
    .flatMap((m) =>
      m.orgs ? [{ id: m.orgs.id, name: m.orgs.name, role: m.role }] : [],
    )
    .sort((a, b) => a.name.localeCompare(b.name));
  const currentOrg =
    orgs.find((org) => org.id === profileResult.data?.default_org_id) ??
    orgs[0];
  if (!currentOrg)
    throw new Error("Your account does not belong to any organisation.");

  const email = claims.email ?? "";
  return {
    user: {
      id: claims.sub,
      email,
      displayName: profileResult.data?.display_name ?? email,
    },
    orgs,
    currentOrg,
  };
});
