import type { Metadata } from "next";

import { PageHeader } from "@/components/app/page-header";
import { NewBrandFlow } from "@/components/features/brands/new-brand-flow";
import { BrandsIcon } from "@/components/ui/icons";

export const metadata: Metadata = { title: "New brand" };

/** The new-brand screen: the flow lays itself out (Figma: Brands/Enter details, fetch details). */
export default function NewBrandPage() {
  return (
    <>
      <PageHeader icon={BrandsIcon} title="New brand" />
      <div className="pt-12 pb-12">
        <NewBrandFlow />
      </div>
    </>
  );
}
