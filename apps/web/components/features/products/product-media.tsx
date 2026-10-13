import { ImageIcon } from "@/components/ui/icons";
import { formatPrice } from "@/lib/products/form";
import type { ProductDetail } from "@/lib/products/queries";

/**
 * The product's stored images (from the pull; Figma Brands Details: square Foreground-01 tiles with
 * 6 px corners, four to a row, 16 px apart). Replacing them comes with the editor.
 */
export function ProductImages({ images }: { images: ProductDetail["images"] }) {
  if (images.length === 0) {
    return (
      <p className="text-type-body-small font-medium text-heading-04">
        No images found.
      </p>
    );
  }
  return (
    <ul className="grid grid-cols-3 gap-4 sm:grid-cols-4">
      {images.map((image, index) => (
        <li
          key={image.source_url}
          className="flex aspect-square items-center justify-center overflow-hidden rounded-sm bg-foreground-01"
        >
          {image.url ? (
            // Product images are stored in the public assets bucket.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={image.url}
              alt={image.alt ?? `Product image ${index + 1}`}
              className="size-full object-contain"
            />
          ) : (
            <span className="flex flex-col items-center gap-1 p-2 text-center text-type-caption-2 text-caption-1">
              <ImageIcon aria-hidden className="size-4" />
              Not downloaded
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Options (variants) and other ways to buy (subscriptions), as read from the store. */
export function ProductOptions({
  variants,
  pricingLines,
  currency,
}: {
  variants: ProductDetail["variants"];
  pricingLines: ProductDetail["pricingLines"];
  currency: string | null;
}) {
  if (variants.length === 0 && pricingLines.length === 0) {
    return (
      <p className="text-type-body-small font-medium text-heading-04">
        One option, no subscription found.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {variants.length > 0 ? (
        <table className="w-full text-left text-type-caption-1">
          <caption className="sr-only">Options</caption>
          <thead className="text-sub-text">
            <tr className="border-b border-stroke">
              <th scope="col" className="py-1.5 pr-3 font-medium">
                Option
              </th>
              <th scope="col" className="py-1.5 pr-3 font-medium">
                Price
              </th>
              <th scope="col" className="py-1.5 font-medium">
                Stock
              </th>
            </tr>
          </thead>
          <tbody>
            {variants.map((variant) => {
              const price = formatPrice(variant.price, currency);
              const was = formatPrice(variant.compare_at_price, currency);
              const onSale =
                was !== null &&
                Number(variant.compare_at_price) > Number(variant.price);
              return (
                <tr
                  key={`${variant.name}-${variant.price}`}
                  className="border-b border-stroke last:border-0"
                >
                  <td className="py-1.5 pr-3">{variant.name}</td>
                  <td className="py-1.5 pr-3 tabular-nums">
                    {price ?? "—"}
                    {onSale ? (
                      <s className="ml-2 text-caption-1">
                        <span className="sr-only">was </span>
                        {was}
                      </s>
                    ) : null}
                  </td>
                  <td className="py-1.5 text-sub-text">
                    {variant.available === null
                      ? "—"
                      : variant.available
                        ? "In stock"
                        : "Sold out"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : null}
      {pricingLines.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <h3 className="text-type-caption-1 font-medium text-sub-text">
            Subscriptions
          </h3>
          <ul className="flex flex-col gap-1 text-type-caption-1">
            {pricingLines.map((line) => (
              <li key={line.label} className="flex justify-between gap-4">
                <span>{line.label}</span>
                <span className="tabular-nums">
                  {formatPrice(line.price, currency) ?? "—"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
