import type { Metadata } from "next";
import { Suspense } from "react";

import { BrandColumn, BrandFrame } from "@/components/app/brand-frame";
import { BrandDnaForm } from "@/components/features/brands/brand-dna-form";
import { BrandFormSkeleton } from "@/components/features/brands/brand-form";
import { rowToForm } from "@/lib/brands/form";

import { loadBrand } from "../brand";

export const metadata: Metadata = { title: "Brand DNA" };

export default function BrandDnaPage({
  params,
}: PageProps<"/brands/[brandId]/dna">) {
  return (
    <Suspense
      fallback={
        <BrandFrame>
          <BrandColumn>
            <BrandFormSkeleton />
          </BrandColumn>
        </BrandFrame>
      }
    >
      <Dna params={params} />
    </Suspense>
  );
}

async function Dna({ params }: { params: Promise<{ brandId: string }> }) {
  const brand = await loadBrand(params);
  return (
    <BrandFrame>
      <BrandColumn>
        <BrandDnaForm
          brandId={brand.row.id}
          defaultValues={rowToForm(brand.row)}
        />
      </BrandColumn>
    </BrandFrame>
  );
}
