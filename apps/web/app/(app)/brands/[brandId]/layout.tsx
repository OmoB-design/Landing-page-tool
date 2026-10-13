import { Suspense } from "react";

import { BrandMark } from "@/components/app/brand-mark";
import { BrandTabs } from "@/components/app/brand-tabs";
import { PageHeader } from "@/components/app/page-header";
import { BrandsIcon } from "@/components/ui/icons";

import { loadBrand } from "./brand";

export default function BrandLayout({
  children,
  params,
}: LayoutProps<"/brands/[brandId]">) {
  return (
    <>
      <Suspense
        fallback={
          <PageHeader
            icon={BrandsIcon}
            crumb={{ label: "Brands", href: "/brands" }}
            title=""
          />
        }
      >
        <BrandHeader params={params} />
      </Suspense>
      {/* The section tabs, 48 px under the header across the 1100 px column. They live here, not
          in each tab's page, so they stay put (and the line slides) while the next tab loads. */}
      <div className="flex justify-center px-6 pt-12">
        <div className="w-full max-w-pages">
          <Suspense fallback={<div className="h-9 divider-b-thin" />}>
            <Tabs params={params} />
          </Suspense>
        </div>
      </div>
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
      crumb={{ label: "Brands", href: "/brands" }}
      mark={
        <BrandMark
          name={brand.row.name}
          emoji={brand.row.emoji}
          color={brand.primary}
          size="crumb"
        />
      }
      title={brand.row.name}
    />
  );
}

async function Tabs({ params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params;
  return <BrandTabs brandId={brandId} />;
}
