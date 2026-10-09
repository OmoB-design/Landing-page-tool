import { cache } from "react";

import { publicEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

const publicAssetUrl = (asset: { bucket: string; path: string } | null) =>
  asset
    ? `${publicEnv.supabaseUrl}/storage/v1/object/public/${asset.bucket}/${asset.path}`
    : null;

const primaryOf = (palette: unknown): string | null => {
  const value = (palette as { primary?: unknown } | null)?.primary;
  return typeof value === "string" ? value : null;
};

/** Live brands of one org, by name (sidebar). Loaded once per request. */
export const getOrgBrands = cache(async (orgId: string) => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("brands")
    .select("id, name, emoji, palette")
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .order("name");
  if (error) throw new Error(`Could not load brands: ${error.message}`);
  return data.map(({ palette, ...brand }) => ({
    ...brand,
    primary: primaryOf(palette),
  }));
});

export type BrandSummary = {
  id: string;
  name: string;
  prefix: string;
  emoji: string | null;
  url: string | null;
  primary: string | null;
  productCount: number;
  updatedAt: Date;
};

/** The Brands list: each brand with its product count. */
export async function getBrandList(orgId: string): Promise<BrandSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("brands")
    .select(
      "id, name, prefix, emoji, url, palette, updated_at, products(count)",
    )
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .is("products.deleted_at", null)
    .order("name");
  if (error) throw new Error(`Could not load brands: ${error.message}`);
  return data.map((brand) => ({
    id: brand.id,
    name: brand.name,
    prefix: brand.prefix,
    emoji: brand.emoji,
    url: brand.url,
    primary: primaryOf(brand.palette),
    productCount: brand.products[0]?.count ?? 0,
    updatedAt: new Date(brand.updated_at),
  }));
}

/** One brand of the org with its logo and favicon URLs, or null if missing. */
export const getBrand = cache(async (orgId: string, brandId: string) => {
  if (!/^[0-9a-f-]{36}$/i.test(brandId)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("brands")
    .select(
      "*, logo:assets!brands_logo_asset_id_fkey(bucket, path), favicon:assets!brands_favicon_asset_id_fkey(bucket, path)",
    )
    .eq("id", brandId)
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(`Could not load the brand: ${error.message}`);
  if (!data) return null;
  const { logo, favicon, ...row } = data;
  return {
    row,
    primary: primaryOf(row.palette),
    logoUrl: publicAssetUrl(logo),
    faviconUrl: publicAssetUrl(favicon),
  };
});
