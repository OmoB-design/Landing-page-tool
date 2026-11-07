import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";

import { DeskProvider } from "@/components/features/builds/desk-context";
import { PageEditor } from "@/components/features/page-editor/page-editor";
import { PageEditorSkeleton } from "@/components/features/page-editor/page-editor-skeleton";
import { getBuildDesk } from "@/lib/api/worker";
import { getSessionContext } from "@/lib/auth/session";
import { getBuild } from "@/lib/builds/queries";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Edit page" };

/** The page editor (BUILD_SPEC §11.2, B3.1a), full screen. A page that isn't built yet (or
 * failed) has nothing to edit: it goes back to its build page. */
export default function PageEditorPage({
  params,
}: PageProps<"/pages/[buildId]/editor">) {
  return (
    <Suspense fallback={<PageEditorSkeleton />}>
      <Editor params={params} />
    </Suspense>
  );
}

async function Editor({ params }: { params: Promise<{ buildId: string }> }) {
  const { buildId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(buildId)) notFound();
  const { currentOrg, user } = await getSessionContext();
  const build = await getBuild(currentOrg.id, buildId);
  if (!build) notFound();
  if (!build.working_html_path || build.status === "failed" || !build.report)
    redirect(`/pages/${buildId}`);
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const desk = session
    ? await getBuildDesk(session.access_token, currentOrg.id, buildId).catch(
        () => null,
      )
    : null;
  if (!desk) redirect(`/pages/${buildId}`);
  return (
    <DeskProvider
      buildId={build.id}
      meId={user.id}
      initial={desk}
      quietRedrafts
      refreshRoute={false}
    >
      <PageEditor
        build={{
          id: build.id,
          key: build.key,
          title: build.title,
          updatedAt: build.updated_at,
        }}
      />
    </DeskProvider>
  );
}
