import type { Database, Json } from "@/types/database";

import type { BrandDraft, BrandFormValues } from "@/lib/validators/brand";

type BrandRow = Database["public"]["Tables"]["brands"]["Row"];
type BrandWrite = Database["public"]["Tables"]["brands"]["Update"];

export const EMPTY_BRAND_FORM: BrandFormValues = {
  name: "",
  prefix: "",
  emoji: "",
  url: "",
  tagline: "",
  positioning: "",
  audience: "",
  brand_context: "",
  voice: "",
  voice_examples: "",
  language: "en",
  cta_text: "",
  palette_primary: "",
  palette_dark: "",
  palette_tint: "",
  palette_accent: "",
  font_heading: "",
  font_body: "",
  sale_percent: "",
  promo_text: "",
  support_email: "",
  meta_title: "",
  meta_description: "",
};

const str = (value: unknown) => (typeof value === "string" ? value : "");
const obj = (value: Json | null) =>
  value && typeof value === "object" && !Array.isArray(value) ? value : {};

/** The fetched draft as form values (the user reviews them before saving). */
export function draftToForm(draft: BrandDraft): BrandFormValues {
  return {
    ...EMPTY_BRAND_FORM,
    name: draft.name,
    prefix: draft.prefix,
    url: draft.url,
    tagline: draft.tagline ?? "",
    positioning: draft.positioning ?? "",
    audience: draft.audience ?? "",
    brand_context: draft.brand_context ?? "",
    voice: draft.voice ?? "",
    voice_examples: draft.voice_examples.join("\n"),
    language: draft.language || "en",
    cta_text: draft.cta_text ?? "",
    palette_primary: draft.palette.primary ?? "",
    palette_dark: draft.palette.dark ?? "",
    palette_tint: draft.palette.tint ?? "",
    palette_accent: draft.palette.accent ?? "",
    font_heading: draft.fonts.heading ?? "",
    font_body: draft.fonts.body ?? "",
    support_email: draft.support_email ?? "",
    meta_title: draft.meta_title ?? "",
    meta_description: draft.meta_description ?? "",
  };
}

/** A saved brand as form values (Brand DNA tab). */
export function rowToForm(row: BrandRow): BrandFormValues {
  const palette = obj(row.palette);
  const fonts = obj(row.fonts);
  return {
    name: row.name,
    prefix: row.prefix,
    emoji: row.emoji ?? "",
    url: row.url ?? "",
    tagline: row.tagline ?? "",
    positioning: row.positioning ?? "",
    audience: row.audience ?? "",
    brand_context: row.brand_context ?? "",
    voice: row.voice ?? "",
    voice_examples: row.voice_examples.join("\n"),
    language: row.language,
    cta_text: row.cta_text ?? "",
    palette_primary: str(palette.primary),
    palette_dark: str(palette.dark),
    palette_tint: str(palette.tint),
    palette_accent: str(palette.accent),
    font_heading: str(fonts.heading),
    font_body: str(fonts.body),
    sale_percent: row.sale_percent === null ? "" : String(row.sale_percent),
    promo_text: row.promo_text ?? "",
    support_email: row.support_email ?? "",
    meta_title: row.meta_title ?? "",
    meta_description: row.meta_description ?? "",
  };
}

const orNull = (value: string) => (value.trim() === "" ? null : value.trim());

/** Validated form values as `brands` columns (empty strings become null). */
export function formToRow(values: BrandFormValues): BrandWrite {
  return {
    name: values.name.trim(),
    prefix: values.prefix.trim(),
    emoji: orNull(values.emoji),
    url: orNull(values.url),
    tagline: orNull(values.tagline),
    positioning: orNull(values.positioning),
    audience: orNull(values.audience),
    brand_context: orNull(values.brand_context),
    voice: orNull(values.voice),
    voice_examples: values.voice_examples
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 10),
    language: values.language.trim() || "en",
    cta_text: orNull(values.cta_text),
    palette: {
      primary: orNull(values.palette_primary)?.toLowerCase() ?? null,
      dark: orNull(values.palette_dark)?.toLowerCase() ?? null,
      tint: orNull(values.palette_tint)?.toLowerCase() ?? null,
      accent: orNull(values.palette_accent)?.toLowerCase() ?? null,
    },
    fonts: {
      heading: orNull(values.font_heading),
      body: orNull(values.font_body),
    },
    sale_percent:
      values.sale_percent.trim() === "" ? null : Number(values.sale_percent),
    promo_text: orNull(values.promo_text),
    support_email: orNull(values.support_email),
    meta_title: orNull(values.meta_title),
    meta_description: orNull(values.meta_description),
  };
}
