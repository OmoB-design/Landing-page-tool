import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { PageHeader } from "@/components/app/page-header";
import {
  SkeletonJobSteps,
  SkeletonStatus,
  SkeletonText,
} from "@/components/app/skeletons";
import { StatusGlyph } from "@/components/app/status-glyph";
import { BuildPreview } from "@/components/features/builds/build-preview";
import { BuildProgress } from "@/components/features/builds/build-progress";
import { BuildReport } from "@/components/features/builds/build-report";
import { ExportButton } from "@/components/features/builds/export-button";
import { PagesIcon } from "@/components/ui/icons";
import { Skeleton } from "@/components/ui/shimmer-loader";
import { getSessionContext } from "@/lib/auth/session";
import { getBuild } from "@/lib/builds/queries";
import { OWNED_BUILD_STEPS } from "@/lib/builds/steps";
import { STATUS_GROUPS } from "@/lib/pages/list";

export const metadata: Metadata = { title: "Page" };

/**
 * A built page: the preview on the left, steps and report on the right (BUILD_SPEC §11.1
 * layout). The full review desk (copy, inks, legal desk, publish) arrives in B1.4.
 */
export default function BuildPage({ params }: PageProps<"/pages/[buildId]">) {
  return (
    <Suspense
      fallback={
        // The same split while the build loads: its key and title, the preview pane and the
        // steps panel.
        <div className="flex h-full flex-col">
          <PageHeader
            icon={PagesIcon}
            mark={<SkeletonText className="text-type-body-small" width={200} />}
            title=""
            actions={
              <SkeletonText className="text-type-caption-1" width={72} />
            }
          />
          <SkeletonStatus label="Loading the page" />
          <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
            <div className="h-screen min-w-0 flex-1 bg-dashboard p-4 lg:h-auto lg:p-6">
              <Skeleton height="100%" radius="var(--radius-lg)" />
            </div>
            <aside
              aria-hidden
              className="flex w-full shrink-0 flex-col gap-6 border-t border-stroke p-4 lg:w-panel lg:border-t-0 lg:border-l"
            >
              <SkeletonJobSteps
                title="Build steps"
                steps={OWNED_BUILD_STEPS.length}
              />
            </aside>
          </div>
        </div>
      }
    >
      <Build params={params} />
    </Suspense>
  );
}

async function Build({ params }: { params: Promise<{ buildId: string }> }) {
  const { buildId } = await params;
  const { currentOrg } = await getSessionContext();
  const build = await getBuild(currentOrg.id, buildId);
  if (!build) notFound();
  const group = STATUS_GROUPS.find((g) => g.statuses.includes(build.status));
  const ready = Boolean(build.working_html_path) && build.status !== "failed";

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon={PagesIcon}
        title={`${build.key} · ${build.title}`}
        actions={
          group ? (
            <span className="flex items-center gap-1.5 text-type-caption-1 text-sub-text">
              <StatusGlyph status={group.id} />
              {group.label}
            </span>
          ) : null
        }
      />
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="h-screen min-w-0 flex-1 bg-dashboard p-4 lg:h-auto lg:p-6">
          {ready ? (
            <BuildPreview buildId={build.id} version={build.updated_at} />
          ) : (
            <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-stroke-strong text-type-body-small text-sub-text">
              {build.status === "failed"
                ? "This build failed. The steps on the right say where."
                : "The preview appears when the build finishes."}
            </div>
          )}
        </div>
        <aside
          aria-label="Build details"
          className="flex w-full shrink-0 flex-col gap-6 overflow-y-auto border-t border-stroke p-4 lg:w-panel lg:border-t-0 lg:border-l"
        >
          <BuildProgress jobId={build.jobId} />
          {ready ? (
            <ExportButton
              buildId={build.id}
              buildKey={build.key}
              exported={Boolean(build.export_html_path)}
            />
          ) : null}
          {build.report ? <BuildReport report={build.report} /> : null}
        </aside>
      </div>
    </div>
  );
}
