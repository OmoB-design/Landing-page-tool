import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { EditorSkeleton } from "@/components/features/templates/editor/editor-skeleton";
import { TemplateEditor } from "@/components/features/templates/editor/template-editor";
import { WorkerError, getTemplateEditor } from "@/lib/api/worker";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { latestAnalysisJobs } from "@/lib/templates/queries";

export const metadata: Metadata = { title: "Edit template" };

/** The section editor for one of the org's templates (BUILD_SPEC §8.3), full screen. */
export default function TemplateEditorPage({
  params,
}: PageProps<"/templates/[templateId]">) {
  return (
    <Suspense fallback={<EditorSkeleton />}>
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
  const analysisJob =
    state.template.origin === "cloned"
      ? ((await latestAnalysisJobs(currentOrg.id, [templateId])).get(
          templateId,
        ) ?? null)
      : null;
  return <TemplateEditor initial={state} analysisJob={analysisJob} />;
}
