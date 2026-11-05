import { z } from "zod";

/**
 * The image studio (BUILD_SPEC §11.2, B3.2a, D109; worker /builds/{id}/images): one image of a
 * built page, what it can become, its last five versions, and the changes to it.
 */

export const IMAGE_RATIOS = ["original", "1:1", "4:3", "3:4", "16:9"] as const;
export const IMAGE_FITS = ["cover", "contain"] as const;
export const IMAGE_FOCUSES = ["top", "center", "bottom"] as const;
export type ImageRatio = (typeof IMAGE_RATIOS)[number];
export type ImageFit = (typeof IMAGE_FITS)[number];
export type ImageFocus = (typeof IMAGE_FOCUSES)[number];
/** The longest alt text (worker ImageAdjust.alt). */
export const ALT_MAX = 250;

const choice = z.object({
  src: z.string(),
  label: z.string(),
  number: z.number().int().nullable().optional(),
});
export type ImageChoice = z.infer<typeof choice>;

export const imageStudioSchema = z.object({
  image: z.object({
    number: z.number().int(),
    src: z.string(),
    alt: z.string(),
    /** logo, product, person, scene, kept (from the template) or image. */
    kind: z.string(),
    section: z.string().nullable(),
    section_label: z.string().nullable(),
    ratio: z.enum(IMAGE_RATIOS).catch("original"),
    fit: z.enum(IMAGE_FITS).catch("cover"),
    focus: z.enum(IMAGE_FOCUSES).catch("center"),
    /** The studio changed how it's shown: Reset puts it back as it was built. */
    changed: z.boolean().catch(false),
  }),
  versions: z.array(
    z.object({
      id: z.string(),
      seq: z.number().int(),
      /** original, product, generated, edited, uploaded or reused. */
      source: z.string(),
      src: z.string(),
      created_at: z.string(),
      current: z.boolean(),
    }),
  ),
  product_photos: z.array(choice),
  page_images: z.array(choice),
  /** Making pictures with AI (B3.2b): free placeholders in mock mode, else the price of one. */
  ai: z
    .object({ mock: z.boolean(), price: z.string().nullable() })
    .catch({ mock: true, price: null }),
  /** A picture already being made for this image. */
  making: z
    .object({ job_id: z.string(), mode: z.enum(["generate", "edit"]) })
    .nullable()
    .catch(null),
});
export type ImageStudio = z.infer<typeof imageStudioSchema>;
export type ImageVersion = ImageStudio["versions"][number];

const base = z.object({ base_version: z.number().int().min(1) });

/** The image studio's changes, as the browser sends them (the route adds the org). */
export const imageActionSchemas = {
  replace: base.extend({
    src: z.string().min(1).max(4000),
    source: z.enum(["product", "reused", "uploaded"]),
    asset_id: z.string().uuid().nullable().optional(),
  }),
  adjust: base.extend({
    ratio: z.enum(IMAGE_RATIOS).optional(),
    fit: z.enum(IMAGE_FITS).optional(),
    focus: z.enum(IMAGE_FOCUSES).optional(),
    alt: z.string().max(ALT_MAX).optional(),
  }),
  restore: base.extend({ version_id: z.string().uuid() }),
} as const;
export type ImageAction = keyof typeof imageActionSchemas;
export type ImageActionBody<A extends ImageAction> = Omit<
  z.infer<(typeof imageActionSchemas)[A]>,
  "base_version"
>;

export function isImageAction(value: string): value is ImageAction {
  return Object.hasOwn(imageActionSchemas, value);
}

/** POST /api/builds/[id]/images/upload: a picture prepared in the browser (lib/pages/images). */
export const imageUploadSchema = z.object({
  data_url: z
    .string()
    .max(6_000_000, "That picture is too large. Try one under 4 MB.")
    .regex(
      /^data:image\/(png|jpeg|webp);base64,/,
      "Pictures must be PNG, JPEG or WebP.",
    ),
});

export const uploadedImageSchema = z.object({
  asset_id: z.string(),
  url: z.string(),
});
export type UploadedImage = z.infer<typeof uploadedImageSchema>;

/** The longest description for an AI picture (worker PROMPT_MAX), and how many product photos
 * can go with it as references. */
export const PROMPT_MAX = 600;
export const REFERENCES_MAX = 3;

/** POST /api/builds/[id]/images/[number]/ai: a new picture for the image, or the one it shows
 * edited, with up to three product photos (their numbers, from 1). */
export const imageAiSchema = z.object({
  mode: z.enum(["generate", "edit"]),
  prompt: z
    .string()
    .trim()
    .min(3, "Say what the picture should show.")
    .max(PROMPT_MAX),
  product_photos: z
    .array(z.number().int().min(1))
    .max(REFERENCES_MAX)
    .default([]),
});
export type ImageAiInput = z.infer<typeof imageAiSchema>;

export const imageJobSchema = z.object({
  job_id: z.string(),
  mode: z.enum(["generate", "edit"]),
});
export type ImageJob = z.infer<typeof imageJobSchema>;
