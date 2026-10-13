import Link from "next/link";

import { Button } from "@/components/ui/button";
import { PlusFigmaIcon } from "@/components/ui/lp-icons";

export function NewBrandButton() {
  return (
    <Button asChild size="compact">
      <Link href="/brands/new">
        <PlusFigmaIcon />
        New brand
      </Link>
    </Button>
  );
}
