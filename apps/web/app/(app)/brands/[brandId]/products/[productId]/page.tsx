import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { formatDistanceToNowStrict } from "date-fns";

import { BrandColumn, BrandFrame } from "@/components/app/brand-frame";
import { SkeletonStatus, SkeletonText } from "@/components/app/skeletons";
import { ProductActions } from "@/components/features/products/product-actions";
import { ProductBriefing } from "@/components/features/products/product-briefing";
import {
  ProductForm,
  ProductFormSkeleton,
} from "@/components/features/products/product-form";
import {
  ProductImages,
  ProductOptions,
} from "@/components/features/products/product-media";
import {
  ChevronLeftFigmaIcon,
  ExternalLinkSmallFigmaIcon,
} from "@/components/ui/lp-icons";
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
    <Suspense fallback={<ProductSkeleton />}>
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
    <BrandFrame
      header={
        <div className="mx-auto flex w-full max-w-150 flex-col gap-5 pr-1 pb-2.5">
          <div className="flex flex-col gap-3">
            <Link
              href={productsHref}
              className="flex w-fit items-center gap-1 rounded-xsm text-type-body-small font-medium text-sub-text outline-none hover:text-heading-01 focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronLeftFigmaIcon className="text-icon-system" />
              All products
            </Link>
            <div className="flex flex-col gap-1.5">
              <h2 className="font-serif text-type-title font-medium text-button-secondary-text">
                {row.name}
              </h2>
              <p className="flex flex-wrap items-center gap-1.5 text-type-body-small font-medium text-heading-02">
                {sale ? (
                  <span className="tabular-nums">
                    {sale}{" "}
                    <s className="text-caption-1">
                      <span className="sr-only">was </span>
                      {regular}
                    </s>
                  </span>
                ) : (
                  <span className="tabular-nums">
                    {regular ?? "No price yet"}
                  </span>
                )}
                {row.pull_source && row.pulled_at ? (
                  <>
                    <span
                      aria-hidden
                      className="size-0.75 rounded-full bg-foreground-03"
                    />
                    <span>
                      From {SOURCE_LABELS[row.pull_source] ?? row.pull_source},{" "}
                      <time
                        dateTime={row.pulled_at}
                        title={new Date(row.pulled_at).toLocaleString("en-GB")}
                      >
                        {formatDistanceToNowStrict(new Date(row.pulled_at), {
                          addSuffix: true,
                        })}
                      </time>
                    </span>
                  </>
                ) : null}
              </p>
              {row.url ? (
                <a
                  href={row.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex w-fit items-center gap-1 rounded-xsm text-type-body-small font-medium text-heading-02 outline-none hover:text-sub-text focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {new URL(row.url).hostname}
                  <ExternalLinkSmallFigmaIcon className="text-icon-nav-active" />
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              ) : null}
            </div>
          </div>
          <ProductActions
            brandId={brand.row.id}
            productId={row.id}
            name={row.name}
            url={row.url}
          />
        </div>
      }
    >
      {/* Images, details and options, closed by a full-width line 32 px below. */}
      <section className="px-6 pb-8 divider-b-thin">
        <div className="mx-auto flex w-full max-w-150 flex-col gap-6 py-1.5">
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
          <Section title="Options and pricing" tight>
            <ProductOptions
              variants={product.variants}
              pricingLines={product.pricingLines}
              currency={row.currency}
            />
          </Section>
        </div>
      </section>
      <BrandColumn width="wide">
        <ProductBriefing
          productId={row.id}
          briefing={product.briefing?.data ?? null}
          updatedAt={product.briefing?.updatedAt ?? null}
        />
      </BrandColumn>
    </BrandFrame>
  );
}

/**
 * The product page while it loads, measured against the loaded page (2026-10-31): the back link;
 * the name, price and store address as lines of their own type; the real action buttons (out of
 * reach); a row of four image tiles; the details form itself, empty; and the options title.
 */
function ProductSkeleton() {
  return (
    <BrandFrame
      header={
        <div className="mx-auto flex w-full max-w-150 flex-col gap-5 pr-1 pb-2.5">
          <div aria-hidden className="flex flex-col gap-3">
            <span className="flex w-fit items-center gap-1 text-type-body-small font-medium text-sub-text">
              <ChevronLeftFigmaIcon className="text-icon-system" />
              All products
            </span>
            <div className="flex flex-col gap-1.5">
              <SkeletonText
                className="font-serif text-type-title"
                width={280}
              />
              <SkeletonText className="text-type-body-small" width={236} />
              <SkeletonText className="text-type-body-small" width={150} />
            </div>
          </div>
          {/* A product read from a store has an address, so Pull again shows too. */}
          <ProductActions
            loading
            brandId=""
            productId=""
            name=""
            url="pending"
          />
        </div>
      }
    >
      <SkeletonStatus label="Loading the product" />
      <section className="px-6 pb-8 divider-b-thin">
        <div className="mx-auto flex w-full max-w-150 flex-col gap-6 py-1.5">
          <Section title="Images">
            <ul aria-hidden className="grid grid-cols-3 gap-4 sm:grid-cols-4">
              {[0, 1, 2, 3].map((tile) => (
                <li key={tile} className="aspect-square">
                  <Skeleton height="100%" radius="var(--radius-sm)" />
                </li>
              ))}
            </ul>
          </Section>
          <Section title="Details">
            <ProductFormSkeleton />
          </Section>
          <Section title="Options and pricing" tight>
            <SkeletonText className="text-type-body-small" width={180} />
          </Section>
        </div>
      </section>
    </BrandFrame>
  );
}

/** A titled block in the 600 px column: a 14 px medium label 16 px above (8 px when `tight`). */
function Section({
  title,
  tight = false,
  children,
}: {
  title: string;
  tight?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className={tight ? "flex flex-col gap-2" : "flex flex-col gap-4"}>
      <h3 className="text-type-body-large leading-normal font-medium text-heading-01">
        {title}
      </h3>
      {children}
    </section>
  );
}
