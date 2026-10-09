import type { Database } from "@/types/database";

import {
  type ProductFormValues,
  type ProductSpec,
  jsonList,
  productSpecSchema,
} from "@/lib/validators/product";

type ProductRow = Database["public"]["Tables"]["products"]["Row"];
type ProductWrite = Database["public"]["Tables"]["products"]["Update"];

const lines = (value: string) =>
  value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

/** "Material: merino wool" per line; a line without a colon is a value with no label. */
export function parseSpecs(value: string): ProductSpec[] {
  return lines(value).map((line) => {
    const colon = line.indexOf(":");
    return colon > 0
      ? {
          label: line.slice(0, colon).trim(),
          value: line.slice(colon + 1).trim(),
        }
      : { label: "", value: line };
  });
}

export function formatSpecs(specs: ProductSpec[]): string {
  return specs
    .map((spec) => (spec.label ? `${spec.label}: ${spec.value}` : spec.value))
    .join("\n");
}

const amount = (value: number | null) =>
  value === null ? "" : Number(value).toFixed(2);

export function productRowToForm(row: ProductRow): ProductFormValues {
  return {
    name: row.name,
    url: row.url ?? "",
    currency: row.currency ?? "",
    price: amount(row.price),
    sale_price: amount(row.sale_price),
    description: row.description ?? "",
    usps: (Array.isArray(row.usps) ? row.usps : [])
      .filter((usp): usp is string => typeof usp === "string")
      .join("\n"),
    specs: formatSpecs(jsonList(productSpecSchema, row.specs)),
    selling_context: row.selling_context ?? "",
  };
}

const orNull = (value: string) => (value.trim() === "" ? null : value.trim());

export function productFormToRow(values: ProductFormValues): ProductWrite {
  return {
    name: values.name.trim(),
    url: orNull(values.url),
    currency: orNull(values.currency)?.toUpperCase() ?? null,
    price: values.price === "" ? null : Number(values.price),
    sale_price: values.sale_price === "" ? null : Number(values.sale_price),
    description: orNull(values.description),
    usps: lines(values.usps),
    specs: parseSpecs(values.specs),
    selling_context: orNull(values.selling_context),
  };
}

/** "$24.00", "£32.00", or "24.00 XYZ" for currencies Intl doesn't know. */
export function formatPrice(
  value: string | number | null | undefined,
  currency: string | null | undefined,
): string | null {
  if (value === null || value === undefined || value === "") return null;
  const amountValue = Number(value);
  if (!Number.isFinite(amountValue)) return null;
  if (!currency) return amountValue.toFixed(2);
  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency,
    }).format(amountValue);
  } catch {
    return `${amountValue.toFixed(2)} ${currency}`;
  }
}
