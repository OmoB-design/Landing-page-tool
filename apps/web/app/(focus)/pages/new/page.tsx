import type { Metadata } from "next";
import { Suspense } from "react";

import { CreateHeader } from "@/components/features/wizard/create-header";
import { CreateWizard } from "@/components/features/wizard/create-wizard";
import { CreateWizardSkeleton } from "@/components/features/wizard/wizard-skeleton";
import { getSessionContext } from "@/lib/auth/session";
import { getWizardData } from "@/lib/wizard/queries";

export const metadata: Metadata = { title: "New page" };

/**
 * The create wizard (BUILD_SPEC §9; Figma: Create new page), full screen (owner, 2026-10-15): its
 * own header with a way out, the serif title and its line 40 px under it and 48 px in, then 40 px
 * below, the wizard's frame filling the panel to 32 px from its foot. The frame keeps its size; its
 * columns scroll inside it. Every "new page" link opens it here, without the sidebar.
 */
export default function NewPage() {
  return (
    <div className="flex min-h-full flex-col lg:h-full">
      <CreateHeader />
      <div className="flex flex-1 flex-col gap-10 px-6 pt-10 pb-8 sm:px-12 lg:min-h-0">
        <div className="flex flex-col gap-1.5">
          <h1 className="font-serif text-type-title font-medium text-button-secondary-text">
            Create new page
          </h1>
          <p className="text-type-body-small font-medium text-sub-text">
            Rebrand a proven template for a brand and product. It ends on the
            page build screen, then its review.
          </p>
        </div>
        <Suspense fallback={<CreateWizardSkeleton />}>
          <Wizard />
        </Suspense>
      </div>
    </div>
  );
}

async function Wizard() {
  const { currentOrg } = await getSessionContext();
  return <CreateWizard data={await getWizardData(currentOrg.id)} />;
}
