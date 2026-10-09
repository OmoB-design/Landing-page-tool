import type { Metadata } from "next";

import { PageBody } from "@/components/app/page-body";
import { PageHeader } from "@/components/app/page-header";
import { NewBrandFlow } from "@/components/features/brands/new-brand-flow";
import { BrandsIcon } from "@/components/ui/icons";

export const metadata: Metadata = { title: "New brand" };

export default function NewBrandPage() {
  return (
    <>
      <PageHeader icon={BrandsIcon} title="New brand" />
      <PageBody>
        <NewBrandFlow />
      </PageBody>
    </>
  );
}
