"use server";

import { z } from "zod";

import { getSessionContext } from "@/lib/auth/session";
import { productFormToRow } from "@/lib/products/form";
import { createClient } from "@/lib/supabase/server";
import {
  type ProductFormValues,
  productFormSchema,
} from "@/lib/validators/product";

export type ProductActionResult = {
  ok?: true;
  error?: string;
  fieldErrors?: Partial<Record<keyof ProductFormValues, string[]>>;
};

/** Saves the product form (RLS limits it to products in the user's orgs). */
export async function updateProduct(
  productId: string,
  values: ProductFormValues,
): Promise<ProductActionResult> {
  const parsed = productFormSchema.safeParse(values);
  if (!parsed.success)
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const { currentOrg } = await getSessionContext();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .update(productFormToRow(parsed.data))
    .eq("id", productId)
    .eq("org_id", currentOrg.id)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();
  if (error) return { error: `Couldn't save the product: ${error.message}` };
  if (!data) return { error: "That product no longer exists." };
  return { ok: true };
}
