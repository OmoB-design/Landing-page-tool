import { ImageIcon } from "@/components/ui/icons";
import { formatPrice } from "@/lib/products/form";
import type { ProductDetail } from "@/lib/products/queries";

/** The product's stored images (from the pull); replacing them comes with the editor. */
export function ProductImages({ images }: { images: ProductDetail["images"] }) {
  if (images.length === 0) {
    return <p className="text-sm text-fg-muted">No images found.</p>;
  }
  return (
    <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
      {images.map((image, index) => (
        <li
          key={image.source_url}
          className="flex aspect-square items-center justify-center overflow-hidden rounded-md border border-border bg-surface-muted"
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
            <span className="flex flex-col items-center gap-1 p-2 text-center text-xs text-fg-subtle">
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
      <p className="text-sm text-fg-muted">
        One option, no subscriptions found.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {variants.length > 0 ? (
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Options</caption>
          <thead className="text-fg-muted">
            <tr className="border-b border-border">
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
                  className="border-b border-border last:border-0"
                >
                  <td className="py-1.5 pr-3">{variant.name}</td>
                  <td className="py-1.5 pr-3 tabular-nums">
                    {price ?? "—"}
                    {onSale ? (
                      <s className="ml-2 text-fg-subtle">
                        <span className="sr-only">was </span>
                        {was}
                      </s>
                    ) : null}
                  </td>
                  <td className="py-1.5 text-fg-muted">
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
          <h3 className="text-sm font-medium text-fg-muted">Subscriptions</h3>
          <ul className="flex flex-col gap-1 text-sm">
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
