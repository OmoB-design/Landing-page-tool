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
  origin: "owned" | "cloned";
  /** A clone's site, e.g. "resilia.shop". */
  sourceHost: string | null;
  /** "rebuild_native" when a clone is a store's product page. */
  verdict: string | null;
  /** Pages can be built from it. A clone needs its analysis confirmed first (B2.2). */
  ready: boolean;
  /** A clone's analysis: running, failed, waiting for review, or not done yet. */
  analysis: "running" | "failed" | "review" | "none" | null;
};

const sectionCount = (rows: { count: number }[] | null) =>
  rows?.[0]?.count ?? 0;

export type AnalysisJob = {
  id: string;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  error: string | null;
};

/** Each clone's latest analysis job (B2.2), by template id: whether one is running or failed. */
export async function latestAnalysisJobs(
  orgId: string,
  templateIds: string[],
): Promise<Map<string, AnalysisJob>> {
  const found = new Map<string, AnalysisJob>();
  if (templateIds.length === 0) return found;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("jobs")
    .select("id, status, error, template_id:payload->>template_id")
    .eq("org_id", orgId)
    .eq("kind", "template_analyze")
    .in("payload->>template_id", templateIds)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(`Could not load analyses: ${error.message}`);
  for (const job of data) {
    const templateId = String(job.template_id ?? "");
    if (!templateId || found.has(templateId)) continue;
    const message = (job.error as { message?: unknown } | null)?.message;
    found.set(templateId, {
      id: job.id,
      status: job.status,
      error: typeof message === "string" ? message : null,
    });
  }
  return found;
}

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
    origin: "owned",
    sourceHost: null,
    verdict: null,
    ready: true,
    analysis: null,
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
      "id, name, type, description, version, updated_at, parent_template_id, origin, source_host, verdict, blueprint, reviewed_at, template_sections(count)",
    )
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(`Could not load templates: ${error.message}`);
  const [parents, analyses] = await Promise.all([
    parentsById(data.map((t) => t.parent_template_id)),
    latestAnalysisJobs(
      orgId,
      data.filter((t) => t.origin === "cloned").map((t) => t.id),
    ),
  ]);
  const analysisOf = (t: (typeof data)[number]) => {
    if (t.origin !== "cloned") return null;
    const job = analyses.get(t.id);
    if (job?.status === "queued" || job?.status === "running") return "running";
    if (t.blueprint === null)
      return job?.status === "failed" ? "failed" : "none";
    return t.reviewed_at === null ? "review" : null;
  };
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
    origin: t.origin,
    sourceHost: t.source_host,
    verdict: t.verdict,
    ready:
      t.origin === "owned" || (t.blueprint !== null && t.reviewed_at !== null),
    analysis: analysisOf(t),
  }));
}

/** A template the org may open (library or its own), with where its files live. */
export const getTemplateFiles = cache(
  async (orgId: string, templateId: string) => {
    if (!/^[0-9a-f-]{36}$/i.test(templateId)) return null;
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("templates")
      .select(
        "id, org_id, html_path, thumb_path, parent_template_id, origin, source_url",
      )
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
    return {
      html: { bucket: own, path: data.html_path },
      thumb,
      // A clone's preview resolves what its scripts would have built against its source (§8.4).
      baseUrl: data.origin === "cloned" ? data.source_url : null,
    };
  },
);
