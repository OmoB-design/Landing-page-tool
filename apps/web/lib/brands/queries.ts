import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

/** Live brands of one org, by name. Loaded once per request. Call after getSessionContext(). */
export const getOrgBrands = cache(async (orgId: string) => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("brands")
    .select("id, name, emoji")
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .order("name");
  if (error) throw new Error(`Could not load brands: ${error.message}`);
  return data;
});
