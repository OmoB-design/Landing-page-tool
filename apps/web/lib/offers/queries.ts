import { createClient } from "@/lib/supabase/server";
import { CHECKOUTS, PRICE_CHANGES } from "@/lib/validators/offer";

import type { OfferRow } from "./form";

const pick = <T extends string>(
  value: string,
  allowed: readonly T[],
  fallback: T,
): T =>
  (allowed as readonly string[]).includes(value) ? (value as T) : fallback;

/**
 * A brand's offers for the Offers tab (B7.2a): the live ones (not archived), the default first,
 * then in the order made, each with how many pages (not in Trash) were built with it.
 */
export async function getBrandOffers(
  orgId: string,
  brandId: string,
): Promise<OfferRow[]> {
  const supabase = await createClient();
  const [offers, uses] = await Promise.all([
    supabase
      .from("offers")
      .select(
        "id, name, price_change, price_value, checkout, code, promo_text, details, is_default",
      )
      .eq("org_id", orgId)
      .eq("brand_id", brandId)
      .is("archived_at", null)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true }),
    supabase
      .from("builds")
      .select("offer_id")
      .eq("org_id", orgId)
      .eq("brand_id", brandId)
      .is("deleted_at", null)
      .not("offer_id", "is", null),
  ]);
  if (offers.error)
    throw new Error(`Could not load offers: ${offers.error.message}`);
  if (uses.error)
    throw new Error(`Could not load offers: ${uses.error.message}`);
  const counts = new Map<string, number>();
  for (const { offer_id } of uses.data)
    if (offer_id) counts.set(offer_id, (counts.get(offer_id) ?? 0) + 1);
  return offers.data.map((offer) => ({
    ...offer,
    price_change: pick(offer.price_change, PRICE_CHANGES, "none"),
    checkout: pick(offer.checkout, CHECKOUTS, "none"),
    price_value: offer.price_value === null ? null : Number(offer.price_value),
    pages: counts.get(offer.id) ?? 0,
  }));
}

/** The currency a brand's prices are in (its newest product's), for "$15 off"; USD without one. */
export async function getBrandCurrency(
  orgId: string,
  brandId: string,
): Promise<string> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("products")
    .select("currency")
    .eq("org_id", orgId)
    .eq("brand_id", brandId)
    .is("deleted_at", null)
    .not("currency", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.currency ?? "USD";
}
