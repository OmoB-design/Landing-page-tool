import type { Metadata } from "next";

import { EmptyState } from "@/components/app/empty-state";
import { BrandColumn, BrandFrame } from "@/components/app/brand-frame";
import { PagesIcon } from "@/components/ui/icons";

export const metadata: Metadata = { title: "Pages" };

export default function BrandPagesPage() {
  return (
    <BrandFrame>
      <BrandColumn width="list">
        <EmptyState icon={PagesIcon} title="No pages for this brand yet">
          Pages you build for this brand appear here.
        </EmptyState>
      </BrandColumn>
    </BrandFrame>
  );
}
