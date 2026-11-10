import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { PageHeader } from "@/components/app/page-header";
import { SkeletonStatus, SkeletonText } from "@/components/app/skeletons";
import { BuildDemo } from "@/components/features/builds/build-demo";
import {
  BuildPreview,
  BuildPreviewSkeleton,
} from "@/components/features/builds/build-preview";
import { BuildReport } from "@/components/features/builds/build-report";
import { pageOfferSchema } from "@/lib/validators/offer";
import {
  BuildSteps,
  BuildStepsCard,
} from "@/components/features/builds/build-steps";
import { BuildWorkspace } from "@/components/features/builds/build-workspace";
import { ClientLink } from "@/components/features/builds/client-link";
import { DeskProvider } from "@/components/features/builds/desk-context";
import {
  DeskChoices,
  DeskPanel,
} from "@/components/features/builds/desk-panel";
import { InksCard } from "@/components/features/builds/inks-card";
import { PageMenu } from "@/components/features/builds/page-menu";
import { PanelStack } from "@/components/features/builds/panel-section";
import { PreviewCheck } from "@/components/features/builds/preview-check";
import { PublishProvider } from "@/components/features/builds/publish-context";
import {
  LiveButton,
  PublishButton,
  PublishedModal,
  Publications,
} from "@/components/features/builds/publish-controls";
import {
  ApproveAction,
  DeskStatusChip,
} from "@/components/features/builds/status-actions";
import { Button } from "@/components/ui/button";
import { PagesIcon, RenameIcon } from "@/components/ui/icons";
import { getBuildDesk, getPublishing } from "@/lib/api/worker";
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
        // The same page while the build loads: the title waits, the preview's toolbar is in place
        // over the empty well and the steps show at rest with their count waiting.
        <div className="flex h-full flex-col">
          <PageHeader
            icon={PagesIcon}
            mark={<SkeletonText className="text-type-body-small" width={192} />}
            title=""
            tools={false}
          />
          <SkeletonStatus label="Loading the page" />
          <BuildWorkspace
            preview={<BuildPreviewSkeleton />}
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
      <BuildSteps
        jobId={build.jobId}
        finished={Boolean(build.report)}
        origin={build.origin}
        templateType={build.templateType}
        status={build.status}
      />
      {build.report ? (
        <BuildReport
          report={build.report}
          costUsd={Number(build.cost_usd)}
          offer={pageOfferSchema.safeParse(build.offer).data?.name ?? null}
        />
      ) : null}
    </>
  );
  const page = (desk: boolean, publish: boolean) => (
    <div className="flex h-full flex-col">
      <PageHeader
        icon={PagesIcon}
        title={`${build.key} · ${build.title}`}
        // A long title is cut short (owner, D141); the whole of it is in its tooltip.
        titleClassName="xl:max-w-56"
        status={desk ? <DeskStatusChip /> : undefined}
        back={
          build.batch_id
            ? {
                label: "Back to the batch",
                href: `/pages/batch/${build.batch_id}`,
              }
            : undefined
        }
        tools={false}
        actions={
          // The owner's order (D141): Live (while the page is live), the next step as the one
          // filled button (Approve, then Publish), Edit page, Client link, then ⋯ (Back to review,
          // Export, Copy key, Move to Trash). Jobs and Notifications aren't on this page.
          <div className="flex items-center gap-2.5">
            {desk ? (
              <>
                {publish ? (
                  <>
                    <LiveButton />
                    <PublishedModal />
                  </>
                ) : null}
                <ApproveAction
                  fixCount={
                    build.report
                      ? reportClaims(build.report).filter(
                          (claim) => claimAction(claim) === "Fix",
                        ).length
                      : 0
                  }
                />
                {publish ? <PublishButton /> : null}
                {/* B3.1a: the page editor, full screen. */}
                <Button
                  asChild
                  variant="outline"
                  size="compact"
                  className="px-3"
                >
                  <Link href={`/pages/${build.id}/editor`}>
                    <RenameIcon aria-hidden className="size-3.5" />
                    Edit page
                  </Link>
                </Button>
                <ClientLink />
              </>
            ) : null}
            <PageMenu buildId={build.id} buildKey={build.key} ready={ready} />
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
            origin={build.origin}
            templateType={build.templateType}
          />
        }
        panel={
          desk ? (
            <DeskPanel
              overview={
                <PanelStack>
                  {overview}
                  <PreviewCheck />
                  {publish ? <Publications /> : null}
                  <InksCard />
                  <DeskChoices wizard={build.wizard} />
                </PanelStack>
              }
            />
          ) : (
            <PanelStack>{overview}</PanelStack>
          )
        }
      />
    </div>
  );

  // The review desk, once the page is built (D84), and its publishing (D87), asked of the worker
  // together. If the worker can't be reached, the page shows without the desk; without publishing
  // the desk still works.
  const [desk, publishing] =
    ready && build.report
      ? await loadDeskAndPublishing(currentOrg.id, build.id)
      : [null, null];
  if (!desk) return page(false, false);
  return (
    <DeskProvider buildId={build.id} meId={user.id} initial={desk}>
      {publishing ? (
        <PublishProvider
          buildId={build.id}
          initial={publishing}
          page={{
            key: build.key,
            title: build.title,
            brandId: build.brand?.id ?? null,
            brand: build.brand?.name ?? null,
            product: build.product?.name ?? null,
            template: build.report?.template.name ?? null,
          }}
        >
          {page(true, true)}
        </PublishProvider>
      ) : (
        page(true, false)
      )}
    </DeskProvider>
  );
}

async function accessToken() {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

async function loadDeskAndPublishing(orgId: string, buildId: string) {
  const token = await accessToken();
  if (!token) return [null, null] as const;
  return Promise.all([
    getBuildDesk(token, orgId, buildId).catch(() => null),
    getPublishing(token, orgId, buildId).catch(() => null),
  ]);
}
