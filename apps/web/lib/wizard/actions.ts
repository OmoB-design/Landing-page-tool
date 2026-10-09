"use server";

import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { type Briefing, briefingSchema } from "@/lib/validators/product";

/** A product's cached briefing (BUILD_SPEC §7.5) for the wizard; null when none is written yet. */
export async function loadBriefing(
  productId: string,
): Promise<{ briefing: Briefing | null; updatedAt: string | null }> {
  if (!/^[0-9a-f-]{36}$/i.test(productId))
    return { briefing: null, updatedAt: null };
  const { currentOrg } = await getSessionContext();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("product_strategy")
    .select("data, created_at")
    .eq("product_id", productId)
    .eq("org_id", currentOrg.id)
    .eq("kind", "briefing")
    .maybeSingle();
  if (error) throw new Error(`Could not load the briefing: ${error.message}`);
  const parsed = data ? briefingSchema.safeParse(data.data) : null;
  return parsed?.success
    ? { briefing: parsed.data, updatedAt: data?.created_at ?? null }
    : { briefing: null, updatedAt: null };
}
