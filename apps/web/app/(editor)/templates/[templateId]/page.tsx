import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { SkeletonButton, SkeletonText } from "@/components/app/skeletons";
import { TemplateEditor } from "@/components/features/templates/editor/template-editor";
import { Skeleton } from "@/components/ui/shimmer-loader";
import { WorkerError, getTemplateEditor } from "@/lib/api/worker";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Edit template" };

/** The section editor for one of the org's templates (BUILD_SPEC §8.3), full screen. */
export default function TemplateEditorPage({
  params,
}: PageProps<"/templates/[templateId]">) {
  return (
    <Suspense
      fallback={
        // The editor while the template loads: the top bar (back, name, saved state, undo, redo,
        // Create a page), the panel (its tabs, then section rows) and the preview with its toolbar.
        <div aria-hidden className="flex h-dvh flex-col bg-dashboard">
          <div className="flex h-topbar shrink-0 items-center gap-3 border-b border-stroke bg-surface-primary px-3 sm:px-4">
            <SkeletonButton width={28} height={28} />
            <SkeletonText className="text-type-body-small" width={168} />
            <span className="hidden sm:flex">
              <SkeletonText className="text-type-caption-1" width={104} />
            </span>
            <span className="ml-auto flex items-center gap-1">
              <SkeletonButton width={28} height={28} />
              <SkeletonButton width={28} height={28} />
              <span className="ml-1">
                <SkeletonButton width={116} height={28} />
              </span>
            </span>
          </div>
          <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
            <div className="h-1/2 shrink-0 border-b border-stroke bg-surface-primary lg:h-auto lg:w-editor-panel lg:border-r lg:border-b-0">
              <div className="border-b border-stroke px-4 py-2.5">
                <SkeletonButton
                  width={248}
                  height={32}
                  radius="var(--radius-lg)"
                />
              </div>
              <div className="flex flex-col gap-2 p-4">
                <Skeleton height={96} radius="var(--radius-md)" />
                <div className="flex flex-col gap-1 pt-2">
                  {[120, 96, 140, 88, 112, 104].map((width) => (
                    <div
                      key={width}
                      className="flex h-9 items-center rounded-md bg-foreground-01 pr-3 pl-6"
                    >
                      <SkeletonText
                        className="text-type-caption-1"
                        width={width}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 p-4 lg:px-8 lg:py-5">
              <div className="flex items-center justify-between gap-3">
                <SkeletonButton
                  width={124}
                  height={32}
                  radius="var(--radius-md)"
                />
                <SkeletonText className="text-type-caption-1" width={120} />
              </div>
              <div className="min-h-0 flex-1">
                <Skeleton height="100%" radius="var(--radius-lg)" />
              </div>
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
  const state = await getTemplateEditor(
    session.access_token,
    currentOrg.id,
    templateId,
  ).catch((cause: unknown) => {
    if (cause instanceof WorkerError && cause.status === 404) return null;
    throw cause;
  });
  if (!state) notFound();
  return <TemplateEditor initial={state} />;
}
