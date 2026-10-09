import type { Metadata } from "next";
import { Suspense } from "react";

import { PageBody } from "@/components/app/page-body";
import { AddProduct } from "@/components/features/products/add-product";
import { ProductsList } from "@/components/features/products/products-list";
import { Skeleton } from "@/components/ui/shimmer-loader";
import { getSessionContext } from "@/lib/auth/session";
import { getBrandProducts } from "@/lib/products/queries";

import { loadBrand } from "../brand";

export const metadata: Metadata = { title: "Products" };

export default function BrandProductsPage({
  params,
}: PageProps<"/brands/[brandId]/products">) {
  return (
    <Suspense
      fallback={
        <PageBody width="lg" className="gap-2">
          <Skeleton height="var(--spacing-row)" radius="var(--radius-sm)" />
          <Skeleton height="var(--spacing-row)" radius="var(--radius-sm)" />
        </PageBody>
      }
    >
      <Products params={params} />
    </Suspense>
  );
}

async function Products({ params }: { params: Promise<{ brandId: string }> }) {
  const brand = await loadBrand(params);
  const { currentOrg } = await getSessionContext();
  const products = await getBrandProducts(currentOrg.id, brand.row.id);
  const site = brand.row.url
    ? new URL(brand.row.url).origin
    : "https://brand.com";
  return (
    <PageBody width="lg">
      <AddProduct brandId={brand.row.id} placeholder={`${site}/products/…`} />
      {products.length > 0 ? (
        <div className="-mx-6">
          <ProductsList brandId={brand.row.id} products={products} />
        </div>
      ) : (
        <p className="text-base text-fg-muted">
          No products yet. Paste a product page above to add one.
        </p>
      )}
    </PageBody>
  );
}
