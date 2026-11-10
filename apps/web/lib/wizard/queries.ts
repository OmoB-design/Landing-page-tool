import { assetUrls } from "@/lib/products/queries";
import { priceChangeLabel } from "@/lib/offers/form";
import { formatPrice } from "@/lib/products/form";
import { createClient } from "@/lib/supabase/server";
import { getLibraryTemplates, getOrgTemplates } from "@/lib/templates/queries";
import { jsonList, productImageSchema } from "@/lib/validators/product";

export type WizardBrand = {
  id: string;
  name: string;
  hasVoice: boolean;
  hasPositioning: boolean;
  /** Primary, dark, tint and accent, as set in Brand DNA (only the ones that are set). */
  colours: { name: string; hex: string }[];
};

export type WizardProduct = {
  id: string;
  brandId: string;
  name: string;
  price: string | null;
  imageUrl: string | null;
  facts: { description: boolean; specs: number; usps: number; images: number };
};

/** One of a brand's live offers, for the Offer picker (B7.2b). */
export type WizardOffer = {
  id: string;
  brandId: string;
  name: string;
  /** "20% off", "$15 off" or "No price change". */
  label: string;
  isDefault: boolean;
};

export type WizardTemplate = {
  id: string;
  name: string;
  type: string;
  description: string | null;
  sections: number;
  group: "Library" | "Yours";
};

const count = (value: unknown) => (Array.isArray(value) ? value.length : 0);

const HEX = /^#[0-9a-f]{6}$/i;
const PALETTE = [
  ["primary", "Primary"],
  ["dark", "Dark"],
  ["tint", "Tint"],
  ["accent", "Accent"],
] as const;
function paletteColours(palette: unknown): WizardBrand["colours"] {
  const p = (palette ?? {}) as Record<string, unknown>;
  return PALETTE.flatMap(([key, name]) => {
    const hex = p[key];
    return typeof hex === "string" && HEX.test(hex) ? [{ name, hex }] : [];
  });
}

/** Everything the create wizard chooses from: the org's brands and products (with the facts the
 * copywriter has for each) and the templates it can build from. */
export async function getWizardData(orgId: string) {
  const supabase = await createClient();
  const [brands, products, library, own, offers] = await Promise.all([
    supabase
      .from("brands")
      .select("id, name, voice, brand_md, positioning, palette")
      .eq("org_id", orgId)
      .is("deleted_at", null)
      .order("name"),
    supabase
      .from("products")
      .select(
        "id, brand_id, name, price, sale_price, currency, description, specs, usps, images",
      )
      .eq("org_id", orgId)
      .is("deleted_at", null)
      .order("name"),
    getLibraryTemplates(),
    getOrgTemplates(orgId),
    supabase
      .from("offers")
      .select("id, brand_id, name, price_change, price_value, is_default")
      .eq("org_id", orgId)
      .is("archived_at", null)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true }),
  ]);
  if (brands.error)
    throw new Error(`Could not load brands: ${brands.error.message}`);
  if (products.error)
    throw new Error(`Could not load products: ${products.error.message}`);
  const firstImage = new Map(
    products.data.map((p) => [
      p.id,
      jsonList(productImageSchema, p.images).find((i) => i.asset_id)?.asset_id,
    ]),
  );
  const urls = await assetUrls(
    [...firstImage.values()].filter((id): id is string => Boolean(id)),
  );
  const brandIds = new Set(brands.data.map((b) => b.id));
  // A brand's money, for "$15 off": its first product's currency (USD without one).
  const currency = new Map<string, string>();
  for (const p of products.data)
    if (p.currency && !currency.has(p.brand_id))
      currency.set(p.brand_id, p.currency);
  return {
    offers: (offers.data ?? []).map((o): WizardOffer => ({
      id: o.id,
      brandId: o.brand_id,
      name: o.name,
      label: priceChangeLabel(
        {
          price_change:
            o.price_change === "percent" || o.price_change === "amount"
              ? o.price_change
              : "none",
          price_value: o.price_value === null ? null : Number(o.price_value),
        },
        currency.get(o.brand_id) ?? "USD",
      ),
      isDefault: o.is_default,
    })),
    brands: brands.data.map((b): WizardBrand => ({
      id: b.id,
      name: b.name,
      hasVoice: Boolean(b.voice || b.brand_md),
      hasPositioning: Boolean(b.positioning),
      colours: paletteColours(b.palette),
    })),
    products: products.data
      .filter((p) => brandIds.has(p.brand_id))
      .map((p): WizardProduct => {
        const asset = firstImage.get(p.id);
        return {
          id: p.id,
          brandId: p.brand_id,
          name: p.name,
          price: formatPrice(p.sale_price ?? p.price, p.currency),
          imageUrl: asset ? (urls.get(asset) ?? null) : null,
          facts: {
            description: Boolean(p.description),
            specs: count(p.specs),
            usps: count(p.usps),
            images: count(p.images),
          },
        };
      }),
    templates: [
      ...library.map((t): WizardTemplate => ({ ...t, group: "Library" })),
      // A clone joins once it's analysed (B2.2); until then it can't be built from.
      ...own
        .filter((t) => t.ready)
        .map((t): WizardTemplate => ({ ...t, group: "Yours" })),
    ].map(({ id, name, type, description, sections, group }) => ({
      id,
      name,
      type,
      description,
      sections,
      group,
    })),
  };
}

export type WizardData = Awaited<ReturnType<typeof getWizardData>>;
