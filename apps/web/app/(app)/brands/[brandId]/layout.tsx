import { Suspense } from "react";

import { BrandMark } from "@/components/app/brand-mark";
import { PageHeader } from "@/components/app/page-header";
import { BrandTabs } from "@/components/features/brands/brand-tabs";
import { BrandsIcon } from "@/components/ui/icons";

import { loadBrand } from "./brand";

export default function BrandLayout({
  children,
  params,
}: LayoutProps<"/brands/[brandId]">) {
  return (
    <>
      <Suspense fallback={<PageHeader icon={BrandsIcon} title="Brand" />}>
        <BrandHeader params={params} />
      </Suspense>
      {children}
    </>
  );
}

async function BrandHeader({
  params,
}: {
  params: Promise<{ brandId: string }>;
}) {
  const brand = await loadBrand(params);
  return (
    <PageHeader
      mark={
        <BrandMark
          name={brand.row.name}
          emoji={brand.row.emoji}
          color={brand.primary}
          size="md"
        />
      }
      title={brand.row.name}
      tabs={<BrandTabs brandId={brand.row.id} />}
    />
  );
}
