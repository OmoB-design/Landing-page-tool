import { cache } from "react";

import type { PageListItem } from "@/lib/pages/list";
import { createClient } from "@/lib/supabase/server";
import {
  type FolderColor,
  buildReportSchema,
  folderColorSchema,
} from "@/lib/validators/build";

/** One build of the org with its latest pipeline job, or null (also for other orgs' builds). */
export const getBuild = cache(async (orgId: string, buildId: string) => {
  if (!/^[0-9a-f-]{36}$/i.test(buildId)) return null;
  const supabase = await createClient();
  const { data: build, error } = await supabase
    .from("builds")
    .select(
      "id, key, title, status, origin, cost_usd, mock_images, report, wizard, offer, working_html_path, export_html_path, updated_at, batch_id, brand:brands(id, name), product:products(id, name), template:templates(type)",
    )
    .eq("id", buildId)
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(`Could not load the build: ${error.message}`);
  if (!build) return null;
  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .select("id")
    .eq("build_id", build.id)
    .eq("org_id", orgId)
    .eq("kind", "build")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (jobError)
    throw new Error(`Could not load the build: ${jobError.message}`);
  const report = buildReportSchema.safeParse(build.report);
  return {
    ...build,
    templateType: build.template?.type ?? null,
    jobId: job?.id ?? null,
    report: report.success ? report.data : null,
  };
});

export type BuildDetail = NonNullable<Awaited<ReturnType<typeof getBuild>>>;

/** The org's builds for the Pages list, newest first. */
export async function getOrgPages(
  orgId: string,
  me: { id: string; name: string },
  /** Only one brand's pages (the brand's Pages tab, B6.9). */
  options: { brandId?: string } = {},
): Promise<PageListItem[]> {
  const supabase = await createClient();
  let query = supabase
    .from("builds")
    .select(
      "id, key, title, status, origin, cost_usd, created_at, updated_at, parent_build_id, copy_number, created_by, batch_id, template_id, brand_id, offer_id, offer_name:offer->>name, current_offer:offers(name), residue:report->residue->>score, template:templates(type), product:products(name), brand:brands(name)",
    )
    .eq("org_id", orgId)
    .is("deleted_at", null);
  if (options.brandId) query = query.eq("brand_id", options.brandId);
  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(`Could not load pages: ${error.message}`);
  // Each batch's folder colour (B3.5b); a batch without a row yet shows red.
  const batchIds = [
    ...new Set(data.flatMap((b) => (b.batch_id ? [b.batch_id] : []))),
  ];
  const colours = new Map<string, FolderColor>();
  if (batchIds.length > 0) {
    const { data: batches, error: batchError } = await supabase
      .from("build_batches")
      .select("id, folder_color")
      .eq("org_id", orgId)
      .in("id", batchIds);
    if (batchError)
      throw new Error(`Could not load pages: ${batchError.message}`);
    for (const batch of batches) {
      const colour = folderColorSchema.safeParse(batch.folder_color);
      if (colour.success) colours.set(batch.id, colour.data);
    }
  }
  return data.map((build) => ({
    id: build.id,
    key: build.key,
    title: build.title,
    status: build.status,
    origin: build.origin,
    templateType: build.template?.type ?? "other",
    residueScore:
      typeof build.residue === "string" && build.residue !== ""
        ? Number(build.residue)
        : null,
    costUsd: Number(build.cost_usd),
    createdAt: new Date(build.created_at),
    updatedAt: new Date(build.updated_at),
    parentId: build.parent_build_id,
    copyNumber: build.copy_number,
    brandId: build.brand_id,
    offerId: build.offer_id,
    // The offer's name now (a rename reaches every list, B7.4), else as the page recorded it.
    offerName: build.current_offer?.name ?? build.offer_name,
    batchId: build.batch_id,
    folderColor: build.batch_id ? colours.get(build.batch_id) : undefined,
    templateId: build.template_id,
    product: build.product?.name ?? undefined,
    brand: build.brand?.name ?? undefined,
    createdBy: {
      // Other members' names arrive with the members build (B1.6).
      name: build.created_by === me.id ? me.name : "A teammate",
      isMe: build.created_by === me.id,
    },
  }));
}
