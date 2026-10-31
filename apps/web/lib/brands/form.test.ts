import { describe, expect, it } from "vitest";

import { EMPTY_BRAND_FORM, draftToForm, formToRow } from "@/lib/brands/form";
import { brandFormSchema } from "@/lib/validators/brand";
import type { BrandDraft } from "@/lib/validators/brand";

const draft: BrandDraft = {
  url: "https://www.lumeskin.test/",
  name: "Lumé Skin",
  prefix: "LS",
  tagline: "Clean skincare",
  positioning: null,
  audience: null,
  brand_context: null,
  voice: "Warm",
  voice_examples: ["Brighter skin in 14 days", "Made in small batches"],
  language: "en-GB",
  cta_text: "Shop now",
  meta_title: "Lumé Skin",
  meta_description: null,
  support_email: "hello@lumeskin.test",
  palette: {
    primary: "#e4572e",
    dark: "#922f13",
    tint: "#f8efed",
    accent: null,
    source_hue: 14,
  },
  palette_candidates: [],
  fonts: { heading: "Lume Display", body: null },
  logo_url: null,
  logo_svg: null,
  favicon_url: null,
  fetched_via: "http",
  ai: "mock",
  warnings: [],
};

describe("brand form mapping", () => {
  it("prefills the form from a fetched draft", () => {
    const values = draftToForm(draft);
    expect(values).toMatchObject({
      name: "Lumé Skin",
      prefix: "LS",
      voice_examples: "Brighter skin in 14 days\nMade in small batches",
      palette_primary: "#e4572e",
      font_heading: "Lume Display",
      font_body: "",
      positioning: "",
    });
    expect(brandFormSchema.safeParse(values).success).toBe(true);
  });

  it("saves empty fields as null and splits voice examples by line", () => {
    const row = formToRow({
      ...EMPTY_BRAND_FORM,
      name: " Lumé ",
      prefix: "LUM",
      voice_examples: "One\n\n  Two  \n",
      palette_primary: "#E4572E",
      sale_percent: "20",
    });
    expect(row).toMatchObject({
      name: "Lumé",
      tagline: null,
      voice_examples: ["One", "Two"],
      palette: { primary: "#e4572e", dark: null, tint: null, accent: null },
      fonts: { heading: null, body: null },
      sale_percent: 20,
      support_email: null,
    });
  });
});

describe("brandFormSchema", () => {
  const valid = { ...EMPTY_BRAND_FORM, name: "Lumé", prefix: "LUM" };

  it.each([
    [{ prefix: "lum" }, "prefix"],
    [{ prefix: "TOOLONG" }, "prefix"],
    [{ palette_primary: "red" }, "palette_primary"],
    [{ url: "lumeskin" }, "url"],
    [{ sale_percent: "120" }, "sale_percent"],
    [{ support_email: "nope" }, "support_email"],
    [{ language: "english!" }, "language"],
    [{ name: " " }, "name"],
    [{ monthly_budget_usd: "-5" }, "monthly_budget_usd"],
    [{ monthly_budget_usd: "12.345" }, "monthly_budget_usd"],
    [{ monthly_budget_usd: "fifty" }, "monthly_budget_usd"],
  ])("rejects %o", (change, field) => {
    const result = brandFormSchema.safeParse({ ...valid, ...change });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path[0]).toBe(field);
  });

  it("accepts a minimal brand", () => {
    expect(brandFormSchema.safeParse(valid).success).toBe(true);
  });

  it("takes a monthly AI budget in dollars, or none", () => {
    for (const budget of ["", "50", "49.99", "0"])
      expect(
        brandFormSchema.safeParse({ ...valid, monthly_budget_usd: budget })
          .success,
      ).toBe(true);
    expect(
      formToRow({ ...valid, monthly_budget_usd: "49.99" }).monthly_budget_usd,
    ).toBe(49.99);
    expect(formToRow(valid).monthly_budget_usd).toBeNull();
  });
});
