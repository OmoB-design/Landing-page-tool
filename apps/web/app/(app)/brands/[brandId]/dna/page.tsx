import type { Metadata } from "next";
import { Suspense } from "react";

import { PageBody } from "@/components/app/page-body";
import { BrandDnaForm } from "@/components/features/brands/brand-dna-form";
import { rowToForm } from "@/lib/brands/form";

import { loadBrand } from "../brand";

export const metadata: Metadata = { title: "Brand DNA" };

export default function BrandDnaPage({
  params,
}: PageProps<"/brands/[brandId]/dna">) {
  return (
    <PageBody>
      <Suspense>
        <Dna params={params} />
      </Suspense>
    </PageBody>
  );
}

async function Dna({ params }: { params: Promise<{ brandId: string }> }) {
  const brand = await loadBrand(params);
  return (
    <BrandDnaForm brandId={brand.row.id} defaultValues={rowToForm(brand.row)} />
  );
}
