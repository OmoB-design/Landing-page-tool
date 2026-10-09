import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { authLinkClass } from "@/components/app/auth-frame";
import { RelativeTime } from "@/components/app/row-meta";
import { ProductActions } from "@/components/features/products/product-actions";
import { ProductBriefing } from "@/components/features/products/product-briefing";
import { ProductForm } from "@/components/features/products/product-form";
import {
  ProductImages,
  ProductOptions,
} from "@/components/features/products/product-media";
import { ExternalLinkIcon } from "@/components/ui/icons";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/shimmer-loader";
import { getSessionContext } from "@/lib/auth/session";
import { formatPrice, productRowToForm } from "@/lib/products/form";
import { getProduct } from "@/lib/products/queries";

import { loadBrand } from "../../brand";

export const metadata: Metadata = { title: "Product" };

const SOURCE_LABELS: Record<string, string> = {
  shopify_json: "the store's product data",
  shopify_admin: "the connected store",
  jsonld: "the page's product data",
  og: "the page's share tags",
  h1: "the page heading",
  manual: "hand entry",
};

export default function ProductPage({
  params,
}: PageProps<"/brands/[brandId]/products/[productId]">) {
  return (
    <Suspense
      fallback={
        <div className="flex max-w-3xl flex-col gap-3 px-6 py-6">
          <Skeleton height="var(--spacing-row)" radius="var(--radius-sm)" />
          <Skeleton height="12rem" radius="var(--radius-md)" />
        </div>
      }
    >
      <Product params={params} />
    </Suspense>
  );
}

async function Product({
  params,
}: {
  params: Promise<{ brandId: string; productId: string }>;
}) {
  const brand = await loadBrand(params);
  const { productId } = await params;
  const { currentOrg } = await getSessionContext();
  const product = await getProduct(currentOrg.id, brand.row.id, productId);
  if (!product) notFound();
  const { row } = product;
  const regular = formatPrice(row.price, row.currency);
  const sale = formatPrice(row.sale_price, row.currency);
  const productsHref = `/brands/${brand.row.id}/products`;

  return (
    <div className="flex max-w-3xl flex-col gap-8 px-6 py-6">
      <div className="flex flex-col gap-3">
        <Link href={productsHref} className={`${authLinkClass} w-fit text-sm`}>
          ← All products
        </Link>
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-semibold">{row.name}</h2>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-fg-muted">
            {sale ? (
              <span className="text-fg tabular-nums">
                {sale}{" "}
                <s className="text-fg-subtle">
                  <span className="sr-only">was </span>
                  {regular}
                </s>
              </span>
            ) : regular ? (
              <span className="text-fg tabular-nums">{regular}</span>
            ) : (
              <span>No price yet</span>
            )}
            {row.pull_source && row.pulled_at ? (
              <span>
                From {SOURCE_LABELS[row.pull_source] ?? row.pull_source},{" "}
                <RelativeTime date={new Date(row.pulled_at)} />
              </span>
            ) : null}
            {row.url ? (
              <a
                href={row.url}
                target="_blank"
                rel="noreferrer"
                className={`${authLinkClass} inline-flex items-center gap-1`}
              >
                {new URL(row.url).hostname}
                <ExternalLinkIcon aria-hidden className="size-3" />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            ) : null}
          </p>
        </div>
        <ProductActions
          brandId={brand.row.id}
          productId={row.id}
          name={row.name}
          url={row.url}
        />
      </div>

      <Section title="Images">
        <ProductImages images={product.images} />
      </Section>

      <Section title="Details">
        {/* Remount only when the product is pulled again: saving keeps what's being typed. */}
        <ProductForm
          key={row.pulled_at ?? row.id}
          productId={row.id}
          defaultValues={productRowToForm(row)}
        />
      </Section>

      <Section title="Options and pricing">
        <ProductOptions
          variants={product.variants}
          pricingLines={product.pricingLines}
          currency={row.currency}
        />
      </Section>

      <Separator />
      <ProductBriefing
        productId={row.id}
        briefing={product.briefing?.data ?? null}
        updatedAt={product.briefing?.updatedAt ?? null}
      />
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-md font-semibold">{title}</h2>
      {children}
    </section>
  );
}
