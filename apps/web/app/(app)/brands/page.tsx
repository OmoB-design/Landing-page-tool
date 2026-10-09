import type { Metadata } from "next";
import { Suspense } from "react";

import { ListToolbar } from "@/components/app/list-toolbar";
import { PageHeader } from "@/components/app/page-header";
import { BrandsList } from "@/components/features/brands/brands-list";
import { NewBrandButton } from "@/components/features/brands/new-brand-button";
import { BrandsIcon } from "@/components/ui/icons";
import { Skeleton } from "@/components/ui/shimmer-loader";
import { getSessionContext } from "@/lib/auth/session";
import { getBrandList } from "@/lib/brands/queries";

export const metadata: Metadata = { title: "Brands" };

export default function BrandsPage() {
  return (
    <>
      <PageHeader
        icon={BrandsIcon}
        title="Brands"
        actions={<NewBrandButton />}
      />
      <Suspense
        fallback={
          <div className="flex flex-col gap-2 px-6 py-4">
            <Skeleton height="var(--spacing-row)" radius="var(--radius-sm)" />
            <Skeleton height="var(--spacing-row)" radius="var(--radius-sm)" />
          </div>
        }
      >
        <Brands />
      </Suspense>
    </>
  );
}

async function Brands() {
  const { currentOrg } = await getSessionContext();
  const brands = await getBrandList(currentOrg.id);
  return (
    <>
      {brands.length > 0 ? (
        <ListToolbar icon={BrandsIcon} label="Brands" count={brands.length} />
      ) : null}
      <BrandsList brands={brands} />
    </>
  );
}
