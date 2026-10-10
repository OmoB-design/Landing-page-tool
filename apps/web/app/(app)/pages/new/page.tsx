import type { Metadata } from "next";
import { Suspense } from "react";

import { PageBody } from "@/components/app/page-body";
import { PageHeader } from "@/components/app/page-header";
import { CreateWizard } from "@/components/features/wizard/create-wizard";
import { PagesIcon } from "@/components/ui/icons";
import { Skeleton } from "@/components/ui/shimmer-loader";
import { getSessionContext } from "@/lib/auth/session";
import { getWizardData } from "@/lib/wizard/queries";

export const metadata: Metadata = { title: "New page" };

/** The create wizard (BUILD_SPEC §9): brand and product → template → imagery → audience →
 * emphasis → review, then the build page. */
export default function NewPage() {
  return (
    <>
      <PageHeader icon={PagesIcon} title="New page" />
      <PageBody width="2xl">
        <p className="text-type-caption-1 text-sub-text">
          Rebrand a proven template for a brand and product. It ends on the
          page’s build screen, then its review.
        </p>
        <Suspense
          fallback={
            <Skeleton
              height="calc(var(--spacing-row) * 12)"
              radius="var(--radius-lg)"
            />
          }
        >
          <Wizard />
        </Suspense>
      </PageBody>
    </>
  );
}

async function Wizard() {
  const { currentOrg } = await getSessionContext();
  return <CreateWizard data={await getWizardData(currentOrg.id)} />;
}
