import { GroupedList, ListRow } from "@/components/app/grouped-list";
import { RelativeTime } from "@/components/app/row-meta";
import { ImageIcon } from "@/components/ui/icons";
import { formatPrice } from "@/lib/products/form";
import type { ProductSummary } from "@/lib/products/queries";

/** A brand's products: image, name, price (and sale price), options, last change. */
export function ProductsList({
  brandId,
  products,
}: {
  brandId: string;
  products: ProductSummary[];
}) {
  return (
    <GroupedList label="Products">
      <ul role="list">
        {products.map((product) => {
          const regular = formatPrice(product.price, product.currency);
          const sale = formatPrice(product.salePrice, product.currency);
          return (
            <ListRow
              key={product.id}
              href={`/brands/${brandId}/products/${product.id}`}
              title={product.name}
              leading={<Thumbnail src={product.imageUrl} />}
              meta={
                <>
                  {sale ? (
                    <span className="text-type-caption-1 tabular-nums">
                      {sale}{" "}
                      <s className="text-caption-1">
                        <span className="sr-only">was </span>
                        {regular}
                      </s>
                    </span>
                  ) : regular ? (
                    <span className="text-type-caption-1 tabular-nums">
                      {regular}
                    </span>
                  ) : null}
                  {product.variantCount > 0 ? (
                    <span className="text-type-caption-1 text-sub-text tabular-nums">
                      {product.variantCount}{" "}
                      {product.variantCount === 1 ? "option" : "options"}
                    </span>
                  ) : null}
                  <RelativeTime date={product.updatedAt} />
                </>
              }
            />
          );
        })}
      </ul>
    </GroupedList>
  );
}

function Thumbnail({ src }: { src: string | null }) {
  return (
    <span className="flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-xsm border border-stroke bg-foreground-01">
      {src ? (
        // Product images are stored in the public assets bucket.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="size-full object-cover" />
      ) : (
        <ImageIcon aria-hidden className="size-3.5 text-caption-1" />
      )}
    </span>
  );
}
