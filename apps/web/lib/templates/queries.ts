import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

export type TemplateCardData = {
  id: string;
  name: string;
  type: string;
  description: string | null;
  sections: number;
  /** For an org template: the library template it was copied from. */
  parentName: string | null;
  version: number;
  updatedAt: Date;
};

const sectionCount = (rows: { count: number }[] | null) =>
  rows?.[0]?.count ?? 0;

/** Library parents of org templates, by id. (A self-join isn't available through the API.) */
async function parentsById(ids: (string | null)[]) {
  const wanted = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (wanted.length === 0)
    return new Map<string, { name: string; thumb_path: string | null }>();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("templates")
    .select("id, name, thumb_path")
    .in("id", wanted);
  if (error) throw new Error(`Could not load templates: ${error.message}`);
  return new Map(data.map((t) => [t.id, t]));
}

/** The curated library (active templates; retired ones are hidden). */
export async function getLibraryTemplates(): Promise<TemplateCardData[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("templates")
    .select(
      "id, name, type, description, version, updated_at, template_sections(count)",
    )
    .is("org_id", null)
    .eq("status", "active")
    .is("deleted_at", null)
    .order("name");
  if (error) throw new Error(`Could not load the library: ${error.message}`);
  return data.map((t) => ({
    id: t.id,
    name: t.name,
    type: t.type,
    description: t.description,
    sections: sectionCount(t.template_sections),
    parentName: null,
    version: t.version,
    updatedAt: new Date(t.updated_at),
  }));
}

/** The org's own templates, most recently changed first. */
export async function getOrgTemplates(
  orgId: string,
): Promise<TemplateCardData[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("templates")
    .select(
      "id, name, type, description, version, updated_at, parent_template_id, template_sections(count)",
    )
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(`Could not load templates: ${error.message}`);
  const parents = await parentsById(data.map((t) => t.parent_template_id));
  return data.map((t) => ({
    id: t.id,
    name: t.name,
    type: t.type,
    description: t.description,
    sections: sectionCount(t.template_sections),
    parentName: t.parent_template_id
      ? (parents.get(t.parent_template_id)?.name ?? null)
      : null,
    version: t.version,
    updatedAt: new Date(t.updated_at),
  }));
}

/** A template the org may open (library or its own), with where its files live. */
export const getTemplateFiles = cache(
  async (orgId: string, templateId: string) => {
    if (!/^[0-9a-f-]{36}$/i.test(templateId)) return null;
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("templates")
      .select("id, org_id, html_path, thumb_path, parent_template_id")
      .eq("id", templateId)
      .or(`org_id.is.null,org_id.eq.${orgId}`)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw new Error(`Could not load the template: ${error.message}`);
    if (!data) return null;
    const own = data.org_id === null ? "library" : "templates";
    // An org copy shows its library parent's thumbnail until it has its own.
    const parentThumb = data.parent_template_id
      ? (await parentsById([data.parent_template_id])).get(
          data.parent_template_id,
        )?.thumb_path
      : null;
    const thumb = data.thumb_path
      ? { bucket: own, path: data.thumb_path }
      : parentThumb
        ? { bucket: "library", path: parentThumb }
        : null;
    return { html: { bucket: own, path: data.html_path }, thumb };
  },
);

/** Templates a test build can use: the library first, then the org's own. */
export async function getBuildableTemplates(orgId: string) {
  const [library, own] = await Promise.all([
    getLibraryTemplates(),
    getOrgTemplates(orgId),
  ]);
  return [
    ...library.map((t) => ({ id: t.id, name: t.name, group: "Library" })),
    ...own.map((t) => ({ id: t.id, name: t.name, group: "Yours" })),
  ];
}
