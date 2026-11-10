import type { Metadata } from "next";
import { Suspense } from "react";

import { BrandColumn, BrandFrame } from "@/components/app/brand-frame";
import {
  SkeletonButton,
  SkeletonMark,
  SkeletonRow,
  SkeletonStatus,
  SkeletonText,
} from "@/components/app/skeletons";
import { OffersView } from "@/components/features/offers/offers-view";
import { getSessionContext } from "@/lib/auth/session";
import { getBrandCurrency, getBrandOffers } from "@/lib/offers/queries";

import { loadBrand } from "../brand";

export const metadata: Metadata = { title: "Offers" };

/**
 * A brand's Offers tab (B7.2a, D146): the deals it runs, each picked for the pages built with it.
 * While it loads, the bar (count and New offer) and three rows, as the loaded tab draws them.
 */
export default function BrandOffersPage({
  params,
}: PageProps<"/brands/[brandId]/offers">) {
  return (
    <Suspense
      fallback={
        <BrandFrame>
          <BrandColumn width="list">
            <div className="flex items-center justify-between gap-4 pb-3.5 divider-b-thin">
              <SkeletonText className="text-type-body-small" width={56} />
              <SkeletonButton width={100} height={30} />
            </div>
            <SkeletonStatus label="Loading offers" />
            <ul aria-hidden className="mt-3 flex flex-col gap-0.5">
              {[168, 132, 196].map((name) => (
                <SkeletonRow
                  key={name}
                  gap="gap-2.5"
                  leading={<SkeletonMark size={24} />}
                  name={name}
                  meta={[64, 48]}
                  menu
                />
              ))}
            </ul>
          </BrandColumn>
        </BrandFrame>
      }
    >
      <Offers params={params} />
    </Suspense>
  );
}

async function Offers({ params }: { params: Promise<{ brandId: string }> }) {
  const brand = await loadBrand(params);
  const { currentOrg } = await getSessionContext();
  const [offers, currency] = await Promise.all([
    getBrandOffers(currentOrg.id, brand.row.id),
    getBrandCurrency(currentOrg.id, brand.row.id),
  ]);
  return (
    <BrandFrame>
      <BrandColumn width="list">
        <OffersView
          brandId={brand.row.id}
          brandName={brand.row.name}
          offers={offers}
          currency={currency}
        />
      </BrandColumn>
    </BrandFrame>
  );
}
