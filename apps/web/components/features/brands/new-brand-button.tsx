import Link from "next/link";

import { Button } from "@/components/ui/button";
import { PlusIcon } from "@/components/ui/icons";

export function NewBrandButton() {
  return (
    <Button asChild size="sm" className="h-8">
      <Link href="/brands/new">
        <PlusIcon aria-hidden />
        New brand
      </Link>
    </Button>
  );
}
