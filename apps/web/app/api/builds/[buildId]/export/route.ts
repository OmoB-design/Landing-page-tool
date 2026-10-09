import { getSessionContext } from "@/lib/auth/session";
import { getBuild } from "@/lib/builds/queries";
import { createClient } from "@/lib/supabase/server";

/** GET /api/builds/[buildId]/export: the exported page as an HTML download (BUILD_SPEC §12.2). */
export async function GET(
  _request: Request,
  { params }: RouteContext<"/api/builds/[buildId]/export">,
) {
  const { buildId } = await params;
  const { currentOrg } = await getSessionContext();
  const build = await getBuild(currentOrg.id, buildId);
  if (!build?.export_html_path) {
    return Response.json({ error: "Not exported yet." }, { status: 404 });
  }
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from("builds")
    .download(build.export_html_path);
  if (error || !data) {
    return Response.json({ error: "Export not found." }, { status: 404 });
  }
  return new Response(data, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename="${build.key}.html"`,
      "Cache-Control": "private, no-store",
    },
  });
}
