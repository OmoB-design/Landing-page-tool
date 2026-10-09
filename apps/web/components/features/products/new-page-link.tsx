import Link from "next/link";

import { Button } from "@/components/ui/button";
import { PagesIcon } from "@/components/ui/icons";

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
    <Button asChild size="sm" className="h-8 self-start">
      <Link href={`/pages/new?${search}`}>
        <PagesIcon aria-hidden />
        New page for this product
      </Link>
    </Button>
  );
}
