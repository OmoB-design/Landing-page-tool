import type { Metadata } from "next";
import { Suspense } from "react";

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
        <div className="flex flex-col gap-2 px-6 py-6">
          <Skeleton height="var(--spacing-row)" radius="var(--radius-sm)" />
          <Skeleton height="var(--spacing-row)" radius="var(--radius-sm)" />
        </div>
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
    <div className="flex flex-col gap-6 py-6">
      <div className="px-6">
        <AddProduct brandId={brand.row.id} placeholder={`${site}/products/…`} />
      </div>
      {products.length > 0 ? (
        <ProductsList brandId={brand.row.id} products={products} />
      ) : (
        <p className="px-6 text-base text-fg-muted">
          No products yet. Paste a product page above to add one.
        </p>
      )}
    </div>
  );
}
