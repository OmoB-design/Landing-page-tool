import { cache } from "react";

import { type SetupProgress, setupProgress } from "@/lib/onboarding/progress";
import { createClient } from "@/lib/supabase/server";

export type { SetupProgress, SetupStep } from "@/lib/onboarding/progress";

/** The current org's setup progress, loaded once per request (RLS scopes the counts). */
export const getSetupProgress = cache(
  async (orgId: string): Promise<SetupProgress> => {
    const supabase = await createClient();
    const count = async (
      query: PromiseLike<{
        count: number | null;
        error: { message: string } | null;
      }>,
    ) => {
      const { count: value, error } = await query;
      if (error)
        throw new Error(`Could not load setup progress: ${error.message}`);
      return value ?? 0;
    };
    const head = { count: "exact" as const, head: true };
    const [brands, products, templates, builds, published] = await Promise.all([
      count(
        supabase
          .from("brands")
          .select("id", head)
          .eq("org_id", orgId)
          .is("deleted_at", null),
      ),
      count(
        supabase
          .from("products")
          .select("id", head)
          .eq("org_id", orgId)
          .is("deleted_at", null),
      ),
      count(
        supabase
          .from("templates")
          .select("id", head)
          .eq("org_id", orgId)
          .is("deleted_at", null),
      ),
      count(
        supabase
          .from("builds")
          .select("id", head)
          .eq("org_id", orgId)
          .is("deleted_at", null),
      ),
      count(
        supabase
          .from("builds")
          .select("id", head)
          .eq("org_id", orgId)
          .eq("status", "published")
          .is("deleted_at", null),
      ),
    ]);
    return setupProgress({ brands, products, templates, builds, published });
  },
);
