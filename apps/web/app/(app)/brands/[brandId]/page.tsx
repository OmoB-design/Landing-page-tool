import { Suspense } from "react";

import {
  BrandOverview,
  BrandOverviewSkeleton,
} from "@/components/features/brands/brand-overview";

import { getSessionContext } from "@/lib/auth/session";
import { getBrandMonthSpend } from "@/lib/brands/queries";

import { loadBrand } from "./brand";

export default function BrandOverviewPage({
  params,
}: PageProps<"/brands/[brandId]">) {
  return (
    <Suspense fallback={<BrandOverviewSkeleton />}>
      <Overview params={params} />
    </Suspense>
  );
}

async function Overview({ params }: { params: Promise<{ brandId: string }> }) {
  const { currentOrg } = await getSessionContext();
  const [brand, spend] = await Promise.all([
    loadBrand(params),
    getBrandMonthSpend(currentOrg.id),
  ]);
  return (
    <BrandOverview brand={brand} spentUsd={spend.get(brand.row.id) ?? 0} />
  );
}
