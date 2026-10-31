import { STATUS_GROUPS } from "@/lib/pages/list";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

import type { LibraryFilters } from "./href";

type Enums = Database["public"]["Enums"];

export type LibraryRow = {
  id: string;
  key: string;
  title: string;
  status: Enums["build_status"];
  origin: Enums["template_origin"];
  costUsd: number;
  createdAt: string;
  brand: string | null;
  template: string | null;
};

/** Every page of the org (trashed ones aside), newest first, with what it cost. */
export async function getLibrary(
  orgId: string,
  filters: LibraryFilters,
  limit: number,
): Promise<{ rows: LibraryRow[]; total: number }> {
  const supabase = await createClient();
  let query = supabase
    .from("builds")
    .select(
      "id, key, title, status, origin, cost_usd, created_at, brand:brands(name), template:templates(name)",
      { count: "exact" },
    )
    .eq("org_id", orgId)
    .is("deleted_at", null);
  if (filters.brand.length) query = query.in("brand_id", filters.brand);
  if (filters.template.length)
    query = query.in("template_id", filters.template);
  if (filters.origin.length) query = query.in("origin", filters.origin);
  if (filters.status.length)
    query = query.in(
      "status",
      STATUS_GROUPS.filter((group) =>
        filters.status.includes(group.id),
      ).flatMap((group) => group.statuses),
    );
  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .range(0, limit - 1);
  if (error) throw new Error(`Could not load the library: ${error.message}`);
  return {
    total: count ?? data.length,
    rows: data.map((build) => ({
      id: build.id,
      key: build.key,
      title: build.title,
      status: build.status,
      origin: build.origin,
      costUsd: Number(build.cost_usd),
      createdAt: build.created_at,
      brand: build.brand?.name ?? null,
      template: build.template?.name ?? null,
    })),
  };
}

/** The brands and templates the org's pages use, for the filters. */
export async function getLibraryOptions(orgId: string) {
  const supabase = await createClient();
  const [brands, used] = await Promise.all([
    supabase
      .from("brands")
      .select("id, name")
      .eq("org_id", orgId)
      .is("deleted_at", null)
      .order("name"),
    supabase
      .from("builds")
      .select("template:templates(id, name)")
      .eq("org_id", orgId)
      .is("deleted_at", null)
      .limit(1000),
  ]);
  if (brands.error || used.error)
    throw new Error("Could not load the library's filters.");
  const templates = new Map<string, string>();
  for (const row of used.data)
    if (row.template) templates.set(row.template.id, row.template.name);
  return {
    brands: brands.data.map((brand) => ({ id: brand.id, label: brand.name })),
    templates: [...templates]
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  };
}
