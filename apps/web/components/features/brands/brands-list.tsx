import { BrandMark } from "@/components/app/brand-mark";
import { EmptyState } from "@/components/app/empty-state";
import { GroupedList, ListRow } from "@/components/app/grouped-list";
import { KeyLabel, RelativeTime } from "@/components/app/row-meta";
import { BrandsIcon } from "@/components/ui/icons";
import type { BrandSummary } from "@/lib/brands/queries";

import { NewBrandButton } from "./new-brand-button";

/** The org's brands: mark, key prefix, name, website, product count, last change. */
export function BrandsList({ brands }: { brands: BrandSummary[] }) {
  if (brands.length === 0) {
    return (
      <EmptyState
        icon={BrandsIcon}
        title="No brands yet"
        action={<NewBrandButton />}
      >
        Add a brand from its website: we read its name, colours, fonts, logo and
        tone for you.
      </EmptyState>
    );
  }
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
