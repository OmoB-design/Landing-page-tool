import Link from "next/link";

import { Button } from "@/components/ui/button";
import { PlusFigmaIcon } from "@/components/ui/lp-icons";

/** The Pages header's action: opens the create wizard (as New brand and Clone a page do); on a
 * brand's Pages tab, with that brand chosen (`brandId`, B6.9). */
export function NewPageButton({ brandId }: { brandId?: string } = {}) {
  const href = brandId
    ? `/pages/new?${new URLSearchParams({ brand: brandId })}`
    : "/pages/new";
  return (
    <Button asChild size="compact" className="h-7.5">
      <Link href={href}>
        <PlusFigmaIcon />
        New page
      </Link>
    </Button>
  );
}
