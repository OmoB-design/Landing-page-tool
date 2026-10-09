import { getSessionContext } from "@/lib/auth/session";
import { publicEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { getTemplateFiles } from "@/lib/templates/queries";

/** GET /preview/template/[templateId]: a library or org template's page, sandboxed like build
 * previews (scripts off, opaque origin). */
export async function GET(
  _request: Request,
  { params }: RouteContext<"/preview/template/[templateId]">,
) {
  const { templateId } = await params;
  const { currentOrg } = await getSessionContext();
  const files = await getTemplateFiles(currentOrg.id, templateId);
  if (!files) return new Response("Not found", { status: 404 });
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(files.html.bucket)
    .download(files.html.path);
  if (error || !data) return new Response("Not found", { status: 404 });
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
