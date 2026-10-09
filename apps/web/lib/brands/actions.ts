"use server";

import { z } from "zod";

import { WorkerError, startWorkerJob } from "@/lib/api/worker";
import { getSessionContext } from "@/lib/auth/session";
import { formToRow } from "@/lib/brands/form";
import { createClient } from "@/lib/supabase/server";
import {
  type BrandAssets,
  type BrandFormValues,
  brandAssetsSchema,
  brandFormSchema,
} from "@/lib/validators/brand";

export type BrandActionResult = {
  ok?: true;
  id?: string;
  /** Saved, but something optional did not happen (e.g. the logo download job). */
  warning?: string;
  error?: string;
  fieldErrors?: Partial<Record<keyof BrandFormValues, string[]>>;
};

const UNIQUE_VIOLATION = "23505";

function prefixTaken(prefix: string): BrandActionResult {
  return {
    fieldErrors: {
      prefix: [`Another brand already uses ${prefix}. Pick other letters.`],
    },
  };
}

/** Creates a brand in the current org (RLS), then queues the logo/favicon download. */
export async function createBrand(
  values: BrandFormValues,
  assets: BrandAssets | null,
): Promise<BrandActionResult> {
  const parsed = brandFormSchema.safeParse(values);
  if (!parsed.success)
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const parsedAssets = assets ? brandAssetsSchema.safeParse(assets) : null;

  const { user, currentOrg } = await getSessionContext();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("brands")
    .insert({
      ...formToRow(parsed.data),
      name: parsed.data.name.trim(),
      prefix: parsed.data.prefix.trim(),
      org_id: currentOrg.id,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === UNIQUE_VIOLATION) return prefixTaken(parsed.data.prefix);
    return { error: `Couldn't save the brand: ${error.message}` };
  }

  const found = parsedAssets?.success ? parsedAssets.data : null;
  if (!found || (!found.logo_url && !found.logo_svg && !found.favicon_url)) {
    return { ok: true, id: data.id };
  }
  const {
    data: { session },
  } = await supabase.auth.getSession();
  try {
    if (!session) throw new WorkerError("No session", 401);
    await startWorkerJob(session.access_token, {
      org_id: currentOrg.id,
      kind: "brand_assets",
      payload: { brand_id: data.id, ...found },
    });
    return { ok: true, id: data.id };
  } catch (cause) {
    const message =
      cause instanceof WorkerError ? cause.message : "unknown error";
    return {
      ok: true,
      id: data.id,
      warning: `Saved. The logo wasn't downloaded (${message}).`,
    };
  }
}

/** Saves the Brand DNA form (RLS limits it to brands in the user's orgs). */
export async function updateBrand(
  brandId: string,
  values: BrandFormValues,
): Promise<BrandActionResult> {
  const parsed = brandFormSchema.safeParse(values);
  if (!parsed.success)
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const { currentOrg } = await getSessionContext();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("brands")
    .update(formToRow(parsed.data))
    .eq("id", brandId)
    .eq("org_id", currentOrg.id)
    .select("id")
    .maybeSingle();
  if (error) {
    if (error.code === UNIQUE_VIOLATION) return prefixTaken(parsed.data.prefix);
    return { error: `Couldn't save the brand: ${error.message}` };
  }
  if (!data) return { error: "That brand no longer exists." };
  return { ok: true, id: data.id };
}
