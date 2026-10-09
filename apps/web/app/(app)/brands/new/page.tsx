import type { Metadata } from "next";

import { PageHeader } from "@/components/app/page-header";
import { NewBrandFlow } from "@/components/features/brands/new-brand-flow";
import { BrandsIcon } from "@/components/ui/icons";

export const metadata: Metadata = { title: "New brand" };

export default function NewBrandPage() {
  return (
    <>
      <PageHeader icon={BrandsIcon} title="New brand" />
      <div className="px-6 py-6">
        <NewBrandFlow />
      </div>
    </>
  );
}
