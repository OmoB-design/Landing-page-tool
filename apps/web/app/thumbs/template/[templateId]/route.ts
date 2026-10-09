import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getTemplateFiles } from "@/lib/templates/queries";

/** GET /thumbs/template/[templateId]: the template's gallery thumbnail (private buckets). */
export async function GET(
  _request: Request,
  { params }: RouteContext<"/thumbs/template/[templateId]">,
) {
  const { templateId } = await params;
  const { currentOrg } = await getSessionContext();
  const files = await getTemplateFiles(currentOrg.id, templateId);
  if (!files?.thumb) return new Response("Not found", { status: 404 });
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(files.thumb.bucket)
    .download(files.thumb.path);
  if (error || !data) return new Response("Not found", { status: 404 });
  return new Response(data, {
    headers: {
      "Content-Type": files.thumb.path.endsWith(".png")
        ? "image/png"
        : "image/jpeg",
      "Cache-Control": "private, max-age=300",
    },
  });
}
