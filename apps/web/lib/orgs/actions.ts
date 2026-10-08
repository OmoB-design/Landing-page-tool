"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

/** Make another of the user's orgs their current org (profiles.default_org_id). */
export async function switchOrg(orgId: string): Promise<void> {
  const targetOrg = z.uuid().parse(orgId);

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;
  if (!userId) redirect("/sign-in");

  // Only orgs the user belongs to. RLS would hide other orgs' rows anyway; this makes the
  // failure explicit instead of silently pointing the profile at an unreadable org.
  const { data: membership, error: membershipError } = await supabase
    .from("org_members")
    .select("org_id")
    .eq("org_id", targetOrg)
    .eq("user_id", userId)
    .maybeSingle();
  if (membershipError)
    throw new Error(`Could not check membership: ${membershipError.message}`);
  if (!membership)
    throw new Error("You are not a member of that organisation.");

  const { error } = await supabase
    .from("profiles")
    .update({ default_org_id: targetOrg })
    .eq("user_id", userId);
  if (error) throw new Error(`Could not switch organisation: ${error.message}`);

  refresh();
}
