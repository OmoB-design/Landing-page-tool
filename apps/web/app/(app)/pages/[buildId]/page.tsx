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
import { ExportButton } from "@/components/features/builds/export-button";
import { PagesIcon } from "@/components/ui/icons";
import { getSessionContext } from "@/lib/auth/session";
import { getBuild } from "@/lib/builds/queries";
import { OWNED_BUILD_STEPS } from "@/lib/builds/steps";

export const metadata: Metadata = { title: "Page" };

/**
 * A built page (Figma Build): the header with the page's key and title and Export; the preview on
 * the left; on the right the build steps, their log, the facts, the copy changes, the claims check
 * and the reminders. The full review desk (copy, inks, legal desk, publish) arrives in B1.4.
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
  const { currentOrg } = await getSessionContext();
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

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon={PagesIcon}
        title={`${build.key} · ${build.title}`}
        actions={
          <ExportButton buildId={build.id} buildKey={build.key} ready={ready} />
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
          <>
            <BuildSteps jobId={build.jobId} finished={Boolean(build.report)} />
            {build.report ? <BuildReport report={build.report} /> : null}
          </>
        }
      />
    </div>
  );
}
