import { z } from "zod";

/** The org's Vercel connection and testing switch (worker GET /integrations, D87). */
export const integrationsStateSchema = z.object({
  vercel: z
    .object({
      account: z.string(),
      team_id: z.string().nullable(),
      token_last4: z.string().nullable(),
      connected_at: z.string(),
      connected_by: z.string().nullable().optional(),
      /** One project per brand, made on the brand's first publish (D87). */
      projects: z
        .array(z.object({ brand_id: z.string(), name: z.string() }))
        .default([]),
    })
    .nullable(),
  /** Each brand's Shopify store (one per brand, D90). */
  shopify: z
    .array(
      z.object({
        brand_id: z.string(),
        brand_name: z.string(),
        shop_domain: z.string(),
        connected_at: z.string().nullable(),
        missing_scopes: z.array(z.string()).default([]),
      }),
    )
    .default([]),
  /** The owner's switch: pages with placeholder images may be published (testing, until B1.3). */
  allow_placeholder_publish: z.boolean(),
  role: z.enum(["owner", "admin", "member"]),
});
export type IntegrationsState = z.infer<typeof integrationsStateSchema>;

export const publicationSchema = z.object({
  id: z.string(),
  destination: z.string(),
  /** "unpublish" takes a page down again (D89). */
  action: z.enum(["publish", "unpublish"]).default("publish"),
  status: z.enum(["pending", "succeeded", "failed", "unpublished"]),
  url: z.string().nullable(),
  created_at: z.string(),
  created_by: z.string().nullable(),
  gate_overridden: z.boolean(),
  override_reasons: z.array(z.string()),
  error: z.string().nullable(),
  page_version: z.number().int().nullable(),
  project: z.string().nullable().optional(),
  seconds: z.number().int().nullable().optional(),
  /** Shopify: the draft in the store's admin. */
  admin_url: z.string().nullable().optional(),
  /** Shopify: the full-width template (false: the theme's page layout, until it's added). */
  full_width: z.boolean().nullable().optional(),
});
export type Publication = z.infer<typeof publicationSchema>;

/** The full-width template's files, for the store owner to add to the theme (D90). */
export const shopifyTemplateSchema = z.object({
  files: z.array(z.object({ path: z.string(), body: z.string() })),
});
export type ShopifyTemplate = z.infer<typeof shopifyTemplateSchema>;

/** A build's publishing (worker GET /builds/{id}/publishing). */
export const publishingStateSchema = z.object({
  build_id: z.string(),
  status: z.string(),
  page_version: z.number().int(),
  /** What blocks publishing now; `overridable` ones pass with "Publish anyway". */
  gate: z.array(
    z.object({
      code: z.string(),
      message: z.string(),
      overridable: z.boolean(),
    }),
  ),
  vercel_connected: z.boolean(),
  live: publicationSchema.nullable(),
  running: publicationSchema.nullable(),
  job_id: z.string().nullable(),
  publications: z.array(publicationSchema),
  /** The brand's Shopify store, and the newest draft made there (D90). */
  shopify_domain: z.string().nullable().default(null),
  shopify_draft: publicationSchema.nullable().default(null),
});
export type PublishingState = z.infer<typeof publishingStateSchema>;

/** Browser → POST /api/integrations/vercel (the route adds the org). */
export const vercelConnectSchema = z.object({
  token: z
    .string()
    .trim()
    .min(10, "Paste the whole token.")
    .max(200, "That's longer than a Vercel token."),
  team_id: z.string().trim().max(100).optional(),
});

/** Browser → POST /api/integrations/shopify (the route adds the org). */
export const shopifyConnectSchema = z.object({
  brand_id: z.string().uuid("Choose a brand."),
  shop_domain: z.string().trim().min(3, "Enter the store's address.").max(120),
  client_id: z.string().trim().min(10, "Paste the whole client id.").max(200),
  client_secret: z
    .string()
    .trim()
    .min(10, "Paste the whole client secret.")
    .max(300),
});

export const testingSwitchSchema = z.object({
  allow_placeholder_publish: z.boolean(),
});

/** Browser → POST /api/builds/[id]/publish. */
export const publishSchema = z.object({
  base_version: z.number().int().min(1),
  destination: z.enum(["vercel", "shopify_page"]),
  override: z.boolean().default(false),
});
