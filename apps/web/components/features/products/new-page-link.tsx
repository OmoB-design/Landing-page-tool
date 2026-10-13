import Link from "next/link";

import { Button } from "@/components/ui/button";
import { PageFigmaIcon } from "@/components/ui/lp-icons";

/** Opens the create wizard with this product chosen, on the template step. */
export function NewPageLink({
  brandId,
  productId,
}: {
  brandId: string;
  productId: string;
}) {
  const search = new URLSearchParams({
    step: "template",
    brand: brandId,
    product: productId,
  });
  return (
    <Button asChild size="compact" className="h-7.5 px-4">
      <Link href={`/pages/new?${search}`}>
        <PageFigmaIcon className="size-4" />
        New Page for this product
      </Link>
    </Button>
  );
}
