import Link from "next/link";

import { BrandMark } from "@/components/app/brand-mark";
import { GroupedList } from "@/components/app/grouped-list";
import { RelativeTime } from "@/components/app/row-meta";
import { RowMenu } from "@/components/app/row-menu";
import { formatPrice } from "@/lib/products/form";
import type { ProductSummary } from "@/lib/products/queries";

/**
 * A brand's products (Figma Brands Details: Brands/product page): 48 px rows 2 px apart across
 * the 1100 px column, each on a 0.7 px line with Foreground-01 on hover: the 24 px picture (the
 * brand's mark when there is none), the name in 13 px medium, then the price in 12 px medium
 * Heading-02 (the sale price with the regular one struck through), the last change and the ⋯.
 */
export function ProductsList({
  brand,
  products,
}: {
  brand: {
    id: string;
    name: string;
    emoji: string | null;
    primary: string | null;
  };
  products: ProductSummary[];
}) {
  return (
    <GroupedList label="Products">
      <ul role="list" className="flex flex-col gap-0.5">
        {products.map((product) => {
          const href = `/brands/${brand.id}/products/${product.id}`;
          const regular = formatPrice(product.price, product.currency);
          const sale = formatPrice(product.salePrice, product.currency);
          const newPage = new URLSearchParams({
            step: "template",
            brand: brand.id,
            product: product.id,
          });
          return (
            <li
              key={product.id}
              className="group/row flex h-12 items-center gap-3 bg-surface-primary pr-4 divider-b-thin hover:bg-foreground-01 has-focus-visible:bg-foreground-01"
            >
              <Link
                href={href}
                data-list-nav=""
                className="flex h-full min-w-0 flex-1 items-center gap-2.5 pl-4 -outline-offset-2"
              >
                {product.imageUrl ? (
                  <span className="flex size-6 shrink-0 overflow-hidden rounded-xsm bg-foreground-01">
                    {/* Product images are stored in the public assets bucket. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={product.imageUrl}
                      alt=""
                      className="size-full object-cover"
                    />
                  </span>
                ) : (
                  <BrandMark
                    name={brand.name}
                    emoji={brand.emoji}
                    color={brand.primary}
                    size="row"
                  />
                )}
                <span className="min-w-0 flex-1 truncate text-type-body-small font-medium text-heading-01">
                  {product.name}
                </span>
                <span className="hidden shrink-0 items-center gap-3 md:flex">
                  {sale ? (
                    <span className="text-type-caption-1 font-medium text-heading-02 tabular-nums">
                      {sale}{" "}
                      <s className="font-normal text-caption-1">
                        <span className="sr-only">was </span>
                        {regular}
                      </s>
                    </span>
                  ) : regular ? (
                    <span className="text-type-caption-1 font-medium text-heading-02 tabular-nums">
                      {regular}
                    </span>
                  ) : null}
                  <RelativeTime date={product.updatedAt} />
                </span>
              </Link>
              <RowMenu
                label={`Actions for ${product.name}`}
                items={[
                  { label: "Open", href },
                  { label: "New page", href: `/pages/new?${newPage}` },
                ]}
              />
            </li>
          );
        })}
      </ul>
    </GroupedList>
  );
}
