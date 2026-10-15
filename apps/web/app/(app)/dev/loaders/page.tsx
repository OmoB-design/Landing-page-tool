import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { PageHeader } from "@/components/app/page-header";
import {
  SkeletonButton,
  SkeletonField,
  SkeletonJobSteps,
  SkeletonText,
} from "@/components/app/skeletons";
import { BrandFormSkeleton } from "@/components/features/brands/brand-form";
import { BrandOverviewSkeleton } from "@/components/features/brands/brand-overview";
import { BrandsListSkeleton } from "@/components/features/brands/brands-list";
import { LoaderTweaks } from "@/components/features/dev/loader-tweaks";
import { ProductsListSkeleton } from "@/components/features/products/products-list";
import { TemplateCardSkeleton } from "@/components/features/templates/template-card";
import { CreateWizardSkeleton } from "@/components/features/wizard/wizard-skeleton";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

export const metadata: Metadata = { title: "Loaders" };

/**
 * /dev/loaders (development only): the app's loading states held still, with a panel to tune
 * the skeletons' opacity, fill, sweep and speed in each theme.
 */
export default function LoadersPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return (
    <>
      <PageHeader title="Loaders" />
      <div className="mx-auto box-content flex w-full max-w-pages flex-col gap-12 px-6 pt-12 pb-40">
        <div className="flex flex-col gap-1.5">
          <h1 className="font-serif text-type-title font-medium text-button-secondary-text">
            Loaders
          </h1>
          <p className="text-type-body-small leading-5 font-medium text-sub-text">
            Every loading state, held still. Tune them with the panel; each
            theme keeps its own values.
          </p>
        </div>

        <Specimen title="Spinner (actions in progress)">
          <div className="flex flex-wrap items-center gap-6 text-icon-system">
            <Spinner label="Loading" />
            <Spinner className="size-3.5" />
            <Spinner className="size-2.5 spinner-thin text-spot-500-blue" />
            <Button size="compact" className="h-8.5 px-4" disabled>
              <Spinner className="size-3.5" />
              Save changes
            </Button>
            <span className="flex items-center gap-2 text-type-body-small font-medium text-sub-text">
              <Spinner className="size-4" />
              Loading people…
            </span>
          </div>
        </Specimen>

        <Specimen title="Text, fields and buttons">
          <div className="grid gap-8 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              <SkeletonText
                className="font-serif text-type-title"
                width={220}
              />
              <SkeletonText className="text-type-body-large" width={260} />
              <SkeletonText className="text-type-body-small" width={300} />
              <SkeletonText className="text-type-caption-1" width={180} />
              <div className="flex gap-1.5 pt-2">
                <SkeletonButton width={160} radius="var(--radius-md)" />
                <SkeletonButton width={96} radius="var(--radius-md)" />
              </div>
            </div>
            <div className="flex flex-col gap-4">
              <SkeletonField label="Product name" value="60%" />
              <SkeletonField label="Description" value="80%" multiline />
            </div>
          </div>
        </Specimen>

        <Specimen title="Brand rows">
          <BrandsListSkeleton />
        </Specimen>

        <Specimen title="Product rows">
          <ProductsListSkeleton />
        </Specimen>

        <Specimen title="Template cards">
          <ul className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {[0, 1, 2, 3].map((index) => (
              <li key={index} className="flex">
                <TemplateCardSkeleton />
              </li>
            ))}
          </ul>
        </Specimen>

        <Specimen title="Steps card">
          <SkeletonJobSteps title="Build steps" steps={6} />
        </Specimen>

        <Specimen title="Create wizard">
          <CreateWizardSkeleton />
        </Specimen>

        <Specimen title="Brand overview">
          <div className="-mx-6">
            <BrandOverviewSkeleton />
          </div>
        </Specimen>

        <Specimen title="Brand DNA">
          <BrandFormSkeleton />
        </Specimen>
      </div>
      <LoaderTweaks />
    </>
  );
}

function Specimen({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-type-body-large leading-normal font-medium text-heading-01">
        {title}
      </h2>
      {children}
    </section>
  );
}
