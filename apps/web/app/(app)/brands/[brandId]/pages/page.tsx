import type { Metadata } from "next";
import { Suspense } from "react";

import { BrandColumn, BrandFrame } from "@/components/app/brand-frame";
import { EmptyState } from "@/components/app/empty-state";
import {
  SkeletonButton,
  SkeletonStatus,
  SkeletonText,
} from "@/components/app/skeletons";
import { NewPageButton } from "@/components/features/pages/new-page-button";
import { PagesList } from "@/components/features/pages/pages-list";
import { PagesListSkeleton } from "@/components/features/pages/pages-view";
import { PagesIcon } from "@/components/ui/icons";
import { getSessionContext } from "@/lib/auth/session";
import { getOrgPages } from "@/lib/builds/queries";
import { groupPages } from "@/lib/pages/list";

import { loadBrand } from "../brand";

export const metadata: Metadata = { title: "Pages" };

/**
 * A brand's Pages tab (B6.9; a placeholder since B0.5): the pages built for this brand, as the
 * Pages screen lists them (grouped by status, a batch's pages in its folder, each row's ⋯), under
 * a bar with how many there are and New page (14 px above its line, owner), which opens the
 * wizard with this brand chosen. Without pages, the empty state offers New page.
 */
export default function BrandPagesPage({
  params,
}: PageProps<"/brands/[brandId]/pages">) {
  return (
    <Suspense
      fallback={
        <BrandFrame>
          <BrandColumn width="list">
            <div className="flex items-center justify-between gap-4 pb-3.5 divider-b-thin">
              <SkeletonText className="text-type-body-small" width={56} />
              <SkeletonButton width={96} height={30} />
            </div>
            <SkeletonStatus label="Loading pages" />
            <PagesListSkeleton className="mt-3" />
          </BrandColumn>
        </BrandFrame>
      }
    >
      <BrandPages params={params} />
    </Suspense>
  );
}

async function BrandPages({
  params,
}: {
  params: Promise<{ brandId: string }>;
}) {
  const brand = await loadBrand(params);
  const { user, currentOrg } = await getSessionContext();
  const pages = await getOrgPages(
    currentOrg.id,
    { id: user.id, name: user.displayName },
    { brandId: brand.row.id },
  );
  return (
    <BrandFrame>
      <BrandColumn width="list">
        {pages.length === 0 ? (
          <EmptyState
            icon={PagesIcon}
            title="No pages for this brand yet"
            action={<NewPageButton brandId={brand.row.id} />}
          >
            Pages you build for {brand.row.name} appear here.
          </EmptyState>
        ) : (
          <>
            <div className="flex items-center justify-between gap-4 pb-3.5 divider-b-thin">
              <p className="text-type-body-small font-medium text-sub-text">
                {pages.length === 1 ? "1 page" : `${pages.length} pages`}
              </p>
              <NewPageButton brandId={brand.row.id} />
            </div>
            <div className="mt-3">
              <PagesList groups={groupPages(pages)} />
            </div>
          </>
        )}
      </BrandColumn>
    </BrandFrame>
  );
}
