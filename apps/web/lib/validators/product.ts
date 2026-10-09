import { z } from "zod";

// Products (BUILD_SPEC §7.2): the edit form, the JSON columns written by the worker's
// product_pull job (services/worker/app/models/product.py) and the cached briefing (§7.5).

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max, { error: `Keep it under ${max} characters.` });
const amount = z
  .string()
  .trim()
  .refine((value) => value === "" || /^\d{1,9}(\.\d{1,2})?$/.test(value), {
    error: "Use a number like 24 or 24.99.",
  });

/** The URL pasted into "Add product". */
export const productUrlSchema = z
  .string()
  .trim()
  .regex(/^(https?:\/\/)?[^\s/]+\.[^\s]+$/i, {
    error: "Enter the product's page, e.g. https://brand.com/products/name",
  });

export const productFormSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, { error: "Enter the product name." })
      .max(200),
    url: z
      .string()
      .trim()
      .refine((value) => value === "" || /^https?:\/\/\S+\.\S+/.test(value), {
        error: "Enter a full address, e.g. https://brand.com/products/name",
      }),
    currency: z
      .string()
      .trim()
      .regex(/^([A-Za-z]{3})?$/, { error: "Use a 3-letter code like USD." }),
    price: amount,
    sale_price: amount,
    description: text(3000),
    usps: text(2000),
    specs: text(3000),
    selling_context: text(1200),
  })
  .refine(
    (values) =>
      values.sale_price === "" ||
      values.price === "" ||
      Number(values.sale_price) < Number(values.price),
    {
      path: ["sale_price"],
      error: "The sale price should be lower than the regular price.",
    },
  );
export type ProductFormValues = z.infer<typeof productFormSchema>;

const money = z.string().nullable().catch(null);

export const productImageSchema = z.object({
  source_url: z.string(),
  alt: z.string().nullable().catch(null),
  asset_id: z.string().nullable().catch(null),
});
export const productVariantSchema = z.object({
  name: z.string(),
  options: z.record(z.string(), z.string()).catch({}),
  price: money,
  compare_at_price: money,
  available: z.boolean().nullable().catch(null),
  image_asset_id: z.string().nullable().catch(null),
});
export const pricingLineSchema = z.object({
  label: z.string(),
  group: z.string().nullable().catch(null),
  price: money,
  compare_at_price: money,
});
export const productSpecSchema = z.object({
  label: z.string(),
  value: z.string(),
});

/** A JSON column as a list of items, skipping any that don't parse. */
export function jsonList<T>(schema: z.ZodType<T>, value: unknown): T[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const parsed = schema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

export type ProductImage = z.infer<typeof productImageSchema>;
export type ProductVariant = z.infer<typeof productVariantSchema>;
export type PricingLine = z.infer<typeof pricingLineSchema>;
export type ProductSpec = z.infer<typeof productSpecSchema>;

/** What a finished product_pull job returns. */
export const productPullResultSchema = z.object({
  product_id: z.string(),
  brand_id: z.string(),
  name: z.string(),
  created: z.boolean(),
  pull_source: z.string(),
  ai: z.enum(["mock", "live"]),
  warnings: z.array(z.string()),
});

export const briefingSchema = z.object({
  audiences: z.array(z.object({ name: z.string(), description: z.string() })),
  benefits: z.array(z.string()),
  features: z.array(z.string()),
  objections: z.array(z.string()),
});
export type Briefing = z.infer<typeof briefingSchema>;
