import type { Metadata } from "next";
import { Suspense } from "react";

import { BrandColumn } from "@/components/app/brand-frame";
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
        <div className="mx-auto flex w-full max-w-pages flex-col gap-2 px-6 pt-10">
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
    <AddProduct brandId={brand.row.id} placeholder={`${site}/products/…`}>
      <BrandColumn width="list">
        {products.length > 0 ? (
          <ProductsList
            brand={{
              id: brand.row.id,
              name: brand.row.name,
              emoji: brand.row.emoji,
              primary: brand.primary,
            }}
            products={products}
          />
        ) : (
          <p className="py-3 text-center text-type-body-small font-medium text-heading-05">
            No products yet. Paste a product page above to add one.
          </p>
        )}
      </BrandColumn>
    </AddProduct>
  );
}
