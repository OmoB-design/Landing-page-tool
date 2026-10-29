import { describe, expect, it } from "vitest";

import {
  formatPrice,
  parseSpecs,
  productFormToRow,
  productRowToForm,
} from "@/lib/products/form";
import type { Database } from "@/types/database";
import {
  jsonList,
  productFormSchema,
  productImageSchema,
  productUrlSchema,
} from "@/lib/validators/product";

type ProductRow = Database["public"]["Tables"]["products"]["Row"];

const row: ProductRow = {
  id: "00000000-0000-4000-8000-000000000001",
  org_id: "00000000-0000-4000-8000-000000000002",
  brand_id: "00000000-0000-4000-8000-000000000003",
  handle: "glow-serum",
  name: "Glow Serum",
  url: "https://www.lumeskin.test/products/glow-serum",
  currency: "GBP",
  price: 32,
  sale_price: 24,
  description: "A daily vitamin C serum.",
  specs: [
    { label: "Size", value: "30 ml" },
    { label: "", value: "Vegan" },
  ],
  usps: ["Brighter-looking skin", "15% vitamin C"],
  images: [],
  variants: [],
  pricing_lines: [],
  selling_context: "For people who want an easy routine.",
  pulled_at: null,
  pull_source: "shopify_json",
  deleted_at: null,
  deleted_by: null,
  trashed_with: null,
  purged_at: null,
  created_at: "2026-10-08T12:00:00Z",
  updated_at: "2026-10-08T12:00:00Z",
};

describe("product form", () => {
  it("turns a row into form values and back", () => {
    const values = productRowToForm(row);
    expect(values).toMatchObject({
      price: "32.00",
      sale_price: "24.00",
      usps: "Brighter-looking skin\n15% vitamin C",
      specs: "Size: 30 ml\nVegan",
    });
    expect(productFormSchema.safeParse(values).success).toBe(true);
    expect(productFormToRow(values)).toMatchObject({
      name: "Glow Serum",
      currency: "GBP",
      price: 32,
      sale_price: 24,
      usps: ["Brighter-looking skin", "15% vitamin C"],
      specs: row.specs,
    });
  });

  it("reads specs as Label: value lines, keeping colons in values", () => {
    expect(parseSpecs(" Size: 30 ml \n\nTime: 9:00 to 5:00\nVegan")).toEqual([
      { label: "Size", value: "30 ml" },
      { label: "Time", value: "9:00 to 5:00" },
      { label: "", value: "Vegan" },
    ]);
  });

  it("checks prices, the sale price and the currency", () => {
    const values = productRowToForm(row);
    const check = (patch: Partial<typeof values>) =>
      productFormSchema.safeParse({ ...values, ...patch });
    expect(check({ price: "24.999" }).success).toBe(false);
    expect(check({ sale_price: "40" }).success).toBe(false);
    expect(check({ currency: "POUND" }).success).toBe(false);
    expect(check({ price: "", sale_price: "", currency: "" }).success).toBe(
      true,
    );
    expect(productFormToRow({ ...values, currency: "gbp" }).currency).toBe(
      "GBP",
    );
  });

  it("accepts product page addresses", () => {
    expect(
      productUrlSchema.safeParse("graza.co/products/drizzle").success,
    ).toBe(true);
    expect(productUrlSchema.safeParse("not a url").success).toBe(false);
  });

  it("formats prices with their currency", () => {
    expect(formatPrice(21, "USD")).toBe("$21.00");
    expect(formatPrice("19.95", "GBP")).toBe("£19.95");
    expect(formatPrice(5, null)).toBe("5.00");
    expect(formatPrice(null, "USD")).toBeNull();
  });

  it("skips JSON items that don't parse", () => {
    expect(
      jsonList(productImageSchema, [
        { source_url: "https://img.test/a.png", alt: null, asset_id: "x" },
        { alt: "no url" },
        "junk",
      ]),
    ).toHaveLength(1);
    expect(jsonList(productImageSchema, null)).toEqual([]);
  });
});
