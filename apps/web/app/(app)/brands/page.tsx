import type { Metadata } from "next";
import { Suspense } from "react";

import { PageHeader } from "@/components/app/page-header";
import { SkeletonStatus } from "@/components/app/skeletons";
import { BrandsHeading } from "@/components/features/brands/brands-heading";
import {
  BrandsList,
  BrandsListSkeleton,
} from "@/components/features/brands/brands-list";
import { NewBrandButton } from "@/components/features/brands/new-brand-button";
import { BrandsIcon } from "@/components/ui/icons";
import { getSessionContext } from "@/lib/auth/session";
import { getBrandList } from "@/lib/brands/queries";

export const metadata: Metadata = { title: "Brands" };

/**
 * /brands (Figma: Brands/Empty, light and dark): an 871 px column 48 px under the header, the
 * Brands title block, then 8 px below, the empty card or the brand list. New brand sits in the
 * header once there are brands (the empty card has its own).
 */
export default function BrandsPage() {
  return (
    <Suspense fallback={<BrandsFallback />}>
      <Brands />
    </Suspense>
  );
}

async function Brands() {
  const { currentOrg } = await getSessionContext();
  const brands = await getBrandList(currentOrg.id);
  return (
    <>
      <PageHeader
        icon={BrandsIcon}
        title="Brands"
        actions={brands.length > 0 ? <NewBrandButton /> : undefined}
      />
      <div className="mx-auto box-content flex w-full max-w-brands flex-col gap-2 px-6 py-12">
        <BrandsHeading />
        <BrandsList brands={brands} />
      </div>
    </>
  );
}

function BrandsFallback() {
  // New brand shows while the list loads, as it will once there are brands (the usual case).
  return (
    <>
      <PageHeader
        icon={BrandsIcon}
        title="Brands"
        actions={<NewBrandButton />}
      />
      <div className="mx-auto box-content flex w-full max-w-brands flex-col gap-2 px-6 py-12">
        <BrandsHeading />
        <SkeletonStatus label="Loading brands" />
        <BrandsListSkeleton />
      </div>
    </>
  );
}
