import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { PageHeader } from "@/components/app/page-header";
import { SkeletonStatus, SkeletonText } from "@/components/app/skeletons";
import { BuildDemo } from "@/components/features/builds/build-demo";
import { BuildPreview } from "@/components/features/builds/build-preview";
import { BuildReport } from "@/components/features/builds/build-report";
import {
  BuildSteps,
  BuildStepsCard,
} from "@/components/features/builds/build-steps";
import { BuildWorkspace } from "@/components/features/builds/build-workspace";
import { DeskProvider } from "@/components/features/builds/desk-context";
import {
  DeskChoices,
  DeskPanel,
} from "@/components/features/builds/desk-panel";
import { ExportButton } from "@/components/features/builds/export-button";
import {
  HeaderDivider,
  StatusActions,
} from "@/components/features/builds/status-actions";
import { PagesIcon } from "@/components/ui/icons";
import { getBuildDesk } from "@/lib/api/worker";
import { getSessionContext } from "@/lib/auth/session";
import { getBuild } from "@/lib/builds/queries";
import { claimAction, reportClaims } from "@/lib/builds/report";
import { OWNED_BUILD_STEPS } from "@/lib/builds/steps";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Page" };

/**
 * A built page (Figma Build): the header with the page's key and title and Export; the preview on
 * the left; on the right the build steps, their log, the facts, the copy changes, the claims check
 * and the reminders. Once the page is built it is the review desk (D84): the status and Approve in
 * the header, the panel's Copy and History tabs, and a preview whose sentences open for editing.
 */
export default function BuildPage({
  params,
  searchParams,
}: PageProps<"/pages/[buildId]">) {
  return (
    <Suspense
      fallback={
        // The same page while the build loads: the title waits, the preview well stays empty and
        // the steps show at rest with their count waiting.
        <div className="flex h-full flex-col">
          <PageHeader
            icon={PagesIcon}
            mark={<SkeletonText className="text-type-body-small" width={320} />}
            title=""
          />
          <SkeletonStatus label="Loading the page" />
          <BuildWorkspace
            preview={<div className="flex-1 bg-foreground-02" />}
            panel={
              <BuildStepsCard
                steps={OWNED_BUILD_STEPS.map((step) => ({
                  ...step,
                  state: "idle",
                }))}
                done={null}
              />
            }
          />
        </div>
      }
    >
      <Build params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Build({
  params,
  searchParams,
}: {
  params: Promise<{ buildId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { buildId } = await params;
  const { currentOrg, user } = await getSessionContext();
  const build = await getBuild(currentOrg.id, buildId);
  if (!build) notFound();
  const failed = build.status === "failed";
  const ready = Boolean(build.working_html_path) && !failed;

  // Development only: `?demo` replays this build from the start, to see the steps animate;
  // `?demo=fail` stops it with a failure.
  const { demo } = await searchParams;
  if (process.env.NODE_ENV !== "production" && demo !== undefined) {
    return (
      <BuildDemo
        key={buildId}
        // `?demo=fail` fails at the fourth step, so Retry can be tried.
        failAt={demo === "fail" ? 4 : undefined}
        build={{
          id: build.id,
          key: build.key,
          title: build.title,
          updatedAt: build.updated_at,
          jobId: build.jobId,
          report: build.report,
          hasPage: ready,
        }}
      />
    );
  }

  const overview = (
    <>
      <BuildSteps jobId={build.jobId} finished={Boolean(build.report)} />
      {build.report ? <BuildReport report={build.report} /> : null}
    </>
  );
  const page = (desk: boolean) => (
    <div className="flex h-full flex-col">
      <PageHeader
        icon={PagesIcon}
        title={`${build.key} · ${build.title}`}
        actions={
          // Figma Review desk: Approve and the status, a rule, Export, a rule (then Jobs and
          // Notifications), 10 px apart.
          <div className="flex items-center gap-2.5">
            {desk ? (
              <>
                <StatusActions
                  fixCount={
                    build.report
                      ? reportClaims(build.report).filter(
                          (claim) => claimAction(claim) === "Fix",
                        ).length
                      : 0
                  }
                />
                <HeaderDivider />
              </>
            ) : null}
            <ExportButton
              buildId={build.id}
              buildKey={build.key}
              ready={ready}
            />
            <HeaderDivider />
          </div>
        }
      />
      <BuildWorkspace
        preview={
          <BuildPreview
            buildId={build.id}
            version={build.updated_at}
            ready={ready}
            failed={failed}
            jobId={build.jobId}
          />
        }
        panel={
          desk ? (
            <DeskPanel
              overview={
                <>
                  {overview}
                  <DeskChoices wizard={build.wizard} />
                </>
              }
            />
          ) : (
            overview
          )
        }
      />
    </div>
  );

  // The review desk, once the page is built (D84). If the worker can't be reached, the page shows
  // without it.
  const desk =
    ready && build.report ? await loadDesk(currentOrg.id, build.id) : null;
  if (!desk) return page(false);
  return (
    <DeskProvider buildId={build.id} meId={user.id} initial={desk}>
      {page(true)}
    </DeskProvider>
  );
}

async function loadDesk(orgId: string, buildId: string) {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return null;
  return getBuildDesk(session.access_token, orgId, buildId).catch(() => null);
}
