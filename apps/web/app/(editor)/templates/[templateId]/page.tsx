import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { TemplateEditor } from "@/components/features/templates/editor/template-editor";
import { Skeleton } from "@/components/ui/shimmer-loader";
import { WorkerError, getTemplateEditor } from "@/lib/api/worker";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getBuildableProducts } from "@/lib/templates/queries";

export const metadata: Metadata = { title: "Edit template" };

/** The section editor for one of the org's templates (BUILD_SPEC §8.3), full screen. */
export default function TemplateEditorPage({
  params,
}: PageProps<"/templates/[templateId]">) {
  return (
    <Suspense
      fallback={
        <div className="flex h-dvh flex-col bg-canvas">
          <div className="h-topbar shrink-0 border-b border-border bg-surface" />
          <div className="flex min-h-0 flex-1">
            <div className="hidden w-editor-panel shrink-0 flex-col gap-2 border-r border-border bg-surface p-4 lg:flex">
              <Skeleton height="var(--spacing-row)" radius="var(--radius-md)" />
              <Skeleton
                height="calc(var(--spacing-row) * 6)"
                radius="var(--radius-md)"
              />
            </div>
            <div className="flex-1 p-8">
              <Skeleton height="100%" radius="var(--radius-lg)" />
            </div>
          </div>
        </div>
      }
    >
      <Editor params={params} />
    </Suspense>
  );
}

async function Editor({ params }: { params: Promise<{ templateId: string }> }) {
  const { templateId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(templateId)) notFound();
  const { currentOrg } = await getSessionContext();
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) notFound();
  const [state, products] = await Promise.all([
    getTemplateEditor(session.access_token, currentOrg.id, templateId).catch(
      (cause: unknown) => {
        if (cause instanceof WorkerError && cause.status === 404) return null;
        throw cause;
      },
    ),
    getBuildableProducts(currentOrg.id),
  ]);
  if (!state) notFound();
  return <TemplateEditor initial={state} products={products} />;
}
