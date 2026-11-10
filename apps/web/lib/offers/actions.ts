"use server";

import { z } from "zod";

import { getSessionContext } from "@/lib/auth/session";
import { formToOffer } from "@/lib/offers/form";
import { createClient } from "@/lib/supabase/server";
import { type OfferFormValues, offerFormSchema } from "@/lib/validators/offer";

// The Offers tab's writes (B7.2a, D146), through the member's own session: RLS keeps them to the
// org, and the grants in the offers migration to these columns.

export type OfferActionResult = {
  ok?: true;
  id?: string;
  /** The saved offer is now the brand's default. */
  isDefault?: boolean;
  error?: string;
  fieldErrors?: Partial<Record<keyof OfferFormValues, string[]>>;
};

const idSchema = z.uuid();

/** A new offer for the brand. A brand's first offer becomes its default whatever the box says. */
export async function createOffer(
  brandId: string,
  values: OfferFormValues,
): Promise<OfferActionResult> {
  const parsed = offerFormSchema.safeParse(values);
  if (!parsed.success)
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  if (!idSchema.safeParse(brandId).success)
    return { error: "That brand isn't available." };
  const { user, currentOrg } = await getSessionContext();
  const supabase = await createClient();
  const { data: current } = await supabase
    .from("offers")
    .select("id")
    .eq("brand_id", brandId)
    .eq("is_default", true)
    .maybeSingle();
  const { data, error } = await supabase
    .from("offers")
    .insert({
      ...formToOffer(parsed.data),
      org_id: currentOrg.id,
      brand_id: brandId,
      created_by: user.id,
      is_default: current === null,
    })
    .select("id")
    .single();
  if (error) return { error: `Couldn't save the offer: ${error.message}` };
  if (parsed.data.is_default && current !== null) {
    const made = await supabase.rpc("make_default_offer", { target: data.id });
    if (made.error)
      return {
        ok: true,
        id: data.id,
        error: "Saved, but it isn't the default yet.",
      };
  }
  return {
    ok: true,
    id: data.id,
    isDefault: current === null || parsed.data.is_default,
  };
}

/** Saves an offer's fields; ticking or unticking Default swaps it in or out. */
export async function updateOffer(
  offerId: string,
  values: OfferFormValues,
): Promise<OfferActionResult> {
  const parsed = offerFormSchema.safeParse(values);
  if (!parsed.success)
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  if (!idSchema.safeParse(offerId).success)
    return { error: "That offer isn't available." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("offers")
    .update({
      ...formToOffer(parsed.data),
      ...(parsed.data.is_default ? {} : { is_default: false }),
    })
    .eq("id", offerId)
    .is("archived_at", null)
    .select("id, is_default")
    .maybeSingle();
  if (error) return { error: `Couldn't save the offer: ${error.message}` };
  if (!data) return { error: "That offer isn't available." };
  if (parsed.data.is_default && !data.is_default)
    return makeDefaultOffer(offerId);
  return { ok: true, id: offerId };
}

/** The offer new pages start with (the brand's old default stops being it). */
export async function makeDefaultOffer(
  offerId: string,
): Promise<OfferActionResult> {
  if (!idSchema.safeParse(offerId).success)
    return { error: "That offer isn't available." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("make_default_offer", {
    target: offerId,
  });
  if (error) return { error: "Couldn't make it the default." };
  return { ok: true, id: offerId };
}

/** Archives an offer: it's no longer offered for new pages; pages built with it keep it. */
export async function archiveOffer(
  offerId: string,
): Promise<OfferActionResult> {
  if (!idSchema.safeParse(offerId).success)
    return { error: "That offer isn't available." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("offers")
    .update({ archived_at: new Date().toISOString(), is_default: false })
    .eq("id", offerId)
    .is("archived_at", null)
    .select("id")
    .maybeSingle();
  if (error || !data) return { error: "Couldn't archive the offer." };
  return { ok: true, id: offerId };
}
