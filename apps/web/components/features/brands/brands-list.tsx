import Link from "next/link";

import { BrandMark } from "@/components/app/brand-mark";
import { GroupedList } from "@/components/app/grouped-list";
import { RelativeTime } from "@/components/app/row-meta";
import { RowMenu } from "@/components/app/row-menu";
import { Button } from "@/components/ui/button";
import { PlusFigmaIcon } from "@/components/ui/lp-icons";
import type { BrandSummary } from "@/lib/brands/queries";

/**
 * The org's brands (Figma Brands Details: Brands/List): 44 px rows 2 px apart, each on a 0.7 px
 * line with Foreground-01 on hover. The 20 px mark and the key prefix (12 px medium) sit in a
 * fixed column, so names (13 px medium) line up; on the right the website, product count and
 * last change in 12 px Sub-Text, then the ⋯ menu, shown on hover or focus.
 */
export function BrandsList({ brands }: { brands: BrandSummary[] }) {
  if (brands.length === 0) return <NoBrands />;
  return (
    <GroupedList label="Brands">
      <ul role="list" className="flex flex-col gap-0.5">
        {brands.map((brand) => (
          <BrandRow key={brand.id} brand={brand} />
        ))}
      </ul>
    </GroupedList>
  );
}

function BrandRow({ brand }: { brand: BrandSummary }) {
  const href = `/brands/${brand.id}`;
  return (
    <li className="group/row flex h-11 items-center gap-3 bg-surface-primary pr-4 divider-b-thin hover:bg-foreground-01 has-focus-visible:bg-foreground-01">
      <Link
        href={href}
        data-list-nav=""
        className="flex h-full min-w-0 flex-1 items-center gap-3 pl-4 -outline-offset-2"
      >
        <span className="flex w-24.25 shrink-0 items-center gap-2.5">
          <BrandMark
            name={brand.name}
            emoji={brand.emoji}
            color={brand.primary}
            size="list"
          />
          <span className="text-type-caption-1 font-medium text-heading-01 tabular-nums">
            {brand.prefix}
          </span>
        </span>
        <span className="min-w-0 flex-1 truncate text-type-body-small font-medium text-heading-01">
          {brand.name}
        </span>
        <span className="hidden shrink-0 items-center gap-3 text-type-caption-1 text-sub-text md:flex">
          {brand.url ? <span>{new URL(brand.url).hostname}</span> : null}
          <span className="tabular-nums">
            {brand.productCount}{" "}
            {brand.productCount === 1 ? "product" : "products"}
          </span>
          <RelativeTime date={brand.updatedAt} />
        </span>
      </Link>
      <RowMenu
        label={`Actions for ${brand.name}`}
        items={[
          { label: "Open", href },
          { label: "Products", href: `${href}/products` },
          { label: "Edit Brand DNA", href: `${href}/dna` },
        ]}
      />
    </li>
  );
}

/**
 * No brands yet (Figma: Brands/Empty): a 160 px card with 18 px corners and the frame edge, its
 * two lines (13 px medium Heading-01, then regular Heading-05, 6 px apart) and, 16 px below,
 * the blue New brand button (30 px).
 */
function NoBrands() {
  return (
    <div className="flex h-40 flex-col items-center justify-center gap-4 rounded-card p-1.5 text-center edge">
      <div className="flex flex-col gap-1.5 text-type-body-small">
        <p className="font-medium text-heading-01">No brands yet</p>
        <p className="text-heading-05">Add a brand from its website</p>
      </div>
      <Button asChild size="compact" className="h-7.5">
        <Link href="/brands/new">
          <PlusFigmaIcon />
          New brand
        </Link>
      </Button>
    </div>
  );
}
