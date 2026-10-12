import { cache } from "react";

import type { PageListItem } from "@/lib/pages/list";
import { createClient } from "@/lib/supabase/server";
import { buildReportSchema } from "@/lib/validators/build";

/** One build of the org with its latest pipeline job, or null (also for other orgs' builds). */
export const getBuild = cache(async (orgId: string, buildId: string) => {
  if (!/^[0-9a-f-]{36}$/i.test(buildId)) return null;
  const supabase = await createClient();
  const { data: build, error } = await supabase
    .from("builds")
    .select(
      "id, key, title, status, origin, cost_usd, mock_images, report, working_html_path, export_html_path, updated_at, brand:brands(id, name), product:products(id, name)",
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
    jobId: job?.id ?? null,
    report: report.success ? report.data : null,
  };
});

export type BuildDetail = NonNullable<Awaited<ReturnType<typeof getBuild>>>;

/** The org's builds for the Pages list, newest first. */
export async function getOrgPages(
  orgId: string,
  me: { id: string; name: string },
): Promise<PageListItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("builds")
    .select(
      "id, key, title, status, origin, cost_usd, created_at, updated_at, parent_build_id, created_by, residue:report->residue->>score, template:templates(type)",
    )
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(`Could not load pages: ${error.message}`);
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
    createdBy: {
      // Other members' names arrive with the members build (B1.6).
      name: build.created_by === me.id ? me.name : "A teammate",
      isMe: build.created_by === me.id,
    },
  }));
}
