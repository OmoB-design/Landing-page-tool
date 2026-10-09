import { Suspense } from "react";

import { BrandOverview } from "@/components/features/brands/brand-overview";

import { loadBrand } from "./brand";

export default function BrandOverviewPage({
  params,
}: PageProps<"/brands/[brandId]">) {
  return (
    <Suspense>
      <Overview params={params} />
    </Suspense>
  );
}

async function Overview({ params }: { params: Promise<{ brandId: string }> }) {
  return <BrandOverview brand={await loadBrand(params)} />;
}
