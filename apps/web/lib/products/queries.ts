import { cache } from "react";

import { publicEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import {
  briefingSchema,
  jsonList,
  pricingLineSchema,
  productImageSchema,
  productVariantSchema,
} from "@/lib/validators/product";

const assetUrl = (asset: { bucket: string; path: string }) =>
  `${publicEnv.supabaseUrl}/storage/v1/object/public/${asset.bucket}/${asset.path}`;

/** Public URLs for stored assets, by id (RLS limits them to the user's orgs). */
export async function assetUrls(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("assets")
    .select("id, bucket, path")
    .in("id", ids);
  if (error) throw new Error(`Could not load images: ${error.message}`);
  return new Map(data.map((asset) => [asset.id, assetUrl(asset)]));
}

export type ProductSummary = {
  id: string;
  name: string;
  handle: string;
  price: number | null;
  salePrice: number | null;
  currency: string | null;
  variantCount: number;
  imageUrl: string | null;
  updatedAt: Date;
};

/** A brand's live products, newest first, each with its first stored image. */
export async function getBrandProducts(
  orgId: string,
  brandId: string,
): Promise<ProductSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .select(
      "id, name, handle, price, sale_price, currency, images, variants, updated_at",
    )
    .eq("org_id", orgId)
    .eq("brand_id", brandId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Could not load products: ${error.message}`);
  const firstImage = (images: unknown) =>
    jsonList(productImageSchema, images).find((image) => image.asset_id)
      ?.asset_id ?? null;
  const urls = await assetUrls(
    data.flatMap((product) => {
      const id = firstImage(product.images);
      return id ? [id] : [];
    }),
  );
  return data.map((product) => {
    const imageId = firstImage(product.images);
    return {
      id: product.id,
      name: product.name,
      handle: product.handle,
      price: product.price,
      salePrice: product.sale_price,
      currency: product.currency,
      variantCount: Array.isArray(product.variants)
        ? product.variants.length
        : 0,
      imageUrl: imageId ? (urls.get(imageId) ?? null) : null,
      updatedAt: new Date(product.updated_at),
    };
  });
}

/** One product of a brand with its images, variants, pricing and cached briefing. */
export const getProduct = cache(
  async (orgId: string, brandId: string, productId: string) => {
    if (!/^[0-9a-f-]{36}$/i.test(productId)) return null;
    const supabase = await createClient();
    const { data: row, error } = await supabase
      .from("products")
      .select("*")
      .eq("id", productId)
      .eq("brand_id", brandId)
      .eq("org_id", orgId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw new Error(`Could not load the product: ${error.message}`);
    if (!row) return null;

    const images = jsonList(productImageSchema, row.images);
    const variants = jsonList(productVariantSchema, row.variants);
    const urls = await assetUrls([
      ...images.flatMap((image) => (image.asset_id ? [image.asset_id] : [])),
      ...variants.flatMap((variant) =>
        variant.image_asset_id ? [variant.image_asset_id] : [],
      ),
    ]);

    const { data: strategy, error: strategyError } = await supabase
      .from("product_strategy")
      .select("data, created_at")
      .eq("product_id", row.id)
      .eq("org_id", orgId)
      .eq("kind", "briefing")
      .maybeSingle();
    if (strategyError)
      throw new Error(`Could not load the briefing: ${strategyError.message}`);
    const briefing = strategy ? briefingSchema.safeParse(strategy.data) : null;

    return {
      row,
      images: images.map((image) => ({
        ...image,
        url: image.asset_id ? (urls.get(image.asset_id) ?? null) : null,
      })),
      variants: variants.map((variant) => ({
        ...variant,
        imageUrl: variant.image_asset_id
          ? (urls.get(variant.image_asset_id) ?? null)
          : null,
      })),
      pricingLines: jsonList(pricingLineSchema, row.pricing_lines),
      briefing: briefing?.success
        ? {
            data: briefing.data,
            updatedAt: new Date(strategy?.created_at ?? Date.now()),
          }
        : null,
    };
  },
);

export type ProductDetail = NonNullable<Awaited<ReturnType<typeof getProduct>>>;
