import Link from "next/link";

import { Button } from "@/components/ui/button";
import { PlusFigmaIcon } from "@/components/ui/lp-icons";

/** The Pages header's action: opens the create wizard (as New brand and Clone a page do). */
export function NewPageButton() {
  return (
    <Button asChild size="compact" className="h-7.5">
      <Link href="/pages/new">
        <PlusFigmaIcon />
        New page
      </Link>
    </Button>
  );
}
