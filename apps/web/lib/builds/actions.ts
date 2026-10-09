"use server";

import { WorkerError, startBuild } from "@/lib/api/worker";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export type StartBuildResult = { buildId?: string; error?: string };

/** Temporary (B0.6a, picker B1.1a): builds a test page for a product from a chosen library or
 * org template, until the create wizard arrives (B1.2). */
export async function startTestBuild(
  productId: string,
  templateId: string,
): Promise<StartBuildResult> {
  const { currentOrg } = await getSessionContext();
  const supabase = await createClient();
  const [{ data: product }, { data: template }] = await Promise.all([
    supabase
      .from("products")
      .select("id, brand_id")
      .eq("id", productId)
      .eq("org_id", currentOrg.id)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase
      .from("templates")
      .select("id")
      .eq("id", templateId)
      .or(`org_id.is.null,org_id.eq.${currentOrg.id}`)
      .eq("status", "active")
      .is("deleted_at", null)
      .maybeSingle(),
  ]);
  if (!product) return { error: "That product no longer exists." };
  if (!template) return { error: "That template isn't available any more." };
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return { error: "Your session has ended. Sign in again." };
  try {
    const { build } = await startBuild(session.access_token, {
      org_id: currentOrg.id,
      template_id: template.id,
      brand_id: product.brand_id,
      product_id: product.id,
    });
    return { buildId: build.id };
  } catch (cause) {
    return {
      error:
        cause instanceof WorkerError
          ? cause.message
          : "Couldn't start the build.",
    };
  }
}
