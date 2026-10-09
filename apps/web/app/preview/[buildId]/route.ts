import { getSessionContext } from "@/lib/auth/session";
import { getBuild } from "@/lib/builds/queries";
import { publicEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /preview/[buildId]: the build's working page, for the sandboxed iframe on the build page.
 * Members of the build's org only (RLS on the build row and on the `builds` bucket). The page
 * runs with scripts off and can't reach this app: the CSP sandbox gives it an opaque origin.
 */
export async function GET(
  _request: Request,
  { params }: RouteContext<"/preview/[buildId]">,
) {
  const { buildId } = await params;
  const { currentOrg } = await getSessionContext();
  const build = await getBuild(currentOrg.id, buildId);
  if (!build?.working_html_path) {
    return new Response("Not found", { status: 404 });
  }
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from("builds")
    .download(build.working_html_path);
  if (error || !data) {
    return new Response("Not found", { status: 404 });
  }
  const storage = new URL(publicEnv.supabaseUrl).origin;
  return new Response(await data.text(), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": [
        "sandbox",
        "default-src 'none'",
        `img-src ${storage} https: data:`,
        "style-src 'unsafe-inline' https:",
        `font-src ${storage} https: data:`,
        "frame-ancestors 'self'",
      ].join("; "),
    },
  });
}
