import { z } from "zod";

// Brand form (Brand DNA) and the worker's brand_autofetch draft (services/worker/app/models/brand.py).

const hex = z
  .string()
  .regex(/^(#[0-9a-fA-F]{6})?$/, { error: "Use a colour like #1f6feb." });
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max, { error: `Keep it under ${max} characters.` });

export const brandFormSchema = z.object({
  name: z.string().trim().min(1, { error: "Enter the brand name." }).max(80),
  prefix: z
    .string()
    .trim()
    .regex(/^[A-Z]{2,4}$/, { error: "Use 2 to 4 capital letters, e.g. LUM." }),
  emoji: text(8),
  url: z
    .string()
    .trim()
    .refine((value) => value === "" || /^https?:\/\/\S+\.\S+/.test(value), {
      error: "Enter a full address, e.g. https://brand.com",
    }),
  tagline: text(200),
  positioning: text(600),
  audience: text(600),
  brand_context: text(1200),
  voice: text(600),
  voice_examples: text(2000),
  language: z
    .string()
    .trim()
    .regex(/^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/, {
      error: "Use a language code like en or en-GB.",
    }),
  cta_text: text(40),
  palette_primary: hex,
  palette_dark: hex,
  palette_tint: hex,
  palette_accent: hex,
  font_heading: text(80),
  font_body: text(80),
  sale_percent: z
    .string()
    .trim()
    .refine(
      (value) =>
        value === "" || (/^\d{1,3}$/.test(value) && Number(value) <= 100),
      {
        error: "Use a whole number from 0 to 100.",
      },
    ),
  promo_text: text(120),
  support_email: z
    .string()
    .trim()
    .refine((value) => value === "" || z.email().safeParse(value).success, {
      error: "Enter a valid email address.",
    }),
  meta_title: text(120),
  meta_description: text(300),
});
export type BrandFormValues = z.infer<typeof brandFormSchema>;

export const brandDraftSchema = z.object({
  url: z.string(),
  name: z.string(),
  prefix: z.string(),
  tagline: z.string().nullable(),
  positioning: z.string().nullable(),
  audience: z.string().nullable(),
  brand_context: z.string().nullable(),
  voice: z.string().nullable(),
  voice_examples: z.array(z.string()),
  language: z.string(),
  cta_text: z.string().nullable(),
  meta_title: z.string().nullable(),
  meta_description: z.string().nullable(),
  support_email: z.string().nullable(),
  palette: z.object({
    primary: z.string().nullable(),
    dark: z.string().nullable(),
    tint: z.string().nullable(),
    accent: z.string().nullable(),
    source_hue: z.number().nullable(),
  }),
  palette_candidates: z.array(
    z.object({
      hex: z.string(),
      label: z.string(),
      reason: z.string(),
      signal: z.number().int().min(0).max(3),
    }),
  ),
  fonts: z.object({
    heading: z.string().nullable(),
    body: z.string().nullable(),
  }),
  logo_url: z.string().nullable(),
  logo_svg: z.string().nullable(),
  favicon_url: z.string().nullable(),
  fetched_via: z.enum(["http", "browser"]),
  ai: z.enum(["mock", "live"]),
  warnings: z.array(z.string()),
});
export type BrandDraft = z.infer<typeof brandDraftSchema>;

/** Logo and favicon found by the fetch, stored by the worker after the brand is saved. */
export const brandAssetsSchema = z.object({
  logo_url: z.string().max(2000).nullable(),
  logo_svg: z.string().max(100_000).nullable(),
  favicon_url: z.string().max(2000).nullable(),
});
export type BrandAssets = z.infer<typeof brandAssetsSchema>;
