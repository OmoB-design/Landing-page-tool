import type { Metadata } from "next";

import { EmptyState } from "@/components/app/empty-state";
import { PagesIcon } from "@/components/ui/icons";

export const metadata: Metadata = { title: "Pages" };

export default function BrandPagesPage() {
  return (
    <EmptyState icon={PagesIcon} title="No pages for this brand yet">
      Pages you build for this brand appear here.
    </EmptyState>
  );
}
