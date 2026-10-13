import Link from "next/link";

import { BrandMark } from "@/components/app/brand-mark";
import { GroupedList, ListRow } from "@/components/app/grouped-list";
import { KeyLabel, RelativeTime } from "@/components/app/row-meta";
import { Button } from "@/components/ui/button";
import { PlusFigmaIcon } from "@/components/ui/lp-icons";
import type { BrandSummary } from "@/lib/brands/queries";

/** The org's brands: mark, key prefix, name, website, product count, last change. */
export function BrandsList({ brands }: { brands: BrandSummary[] }) {
  if (brands.length === 0) return <NoBrands />;
  return (
    <GroupedList label="Brands">
      <ul role="list">
        {brands.map((brand) => (
          <ListRow
            key={brand.id}
            href={`/brands/${brand.id}`}
            title={brand.name}
            leading={
              <>
                <BrandMark
                  name={brand.name}
                  emoji={brand.emoji}
                  color={brand.primary}
                  size="md"
                />
                <KeyLabel>{brand.prefix}</KeyLabel>
              </>
            }
            meta={
              <>
                {brand.url ? (
                  <span className="text-type-caption-1 text-sub-text">
                    {new URL(brand.url).hostname}
                  </span>
                ) : null}
                <span className="text-type-caption-1 text-sub-text tabular-nums">
                  {brand.productCount}{" "}
                  {brand.productCount === 1 ? "product" : "products"}
                </span>
                <RelativeTime date={brand.updatedAt} />
              </>
            }
          />
        ))}
      </ul>
    </GroupedList>
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
