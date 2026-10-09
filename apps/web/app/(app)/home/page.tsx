import type { Metadata } from "next";
import { Suspense } from "react";

import { PageBody } from "@/components/app/page-body";
import { PageHeader } from "@/components/app/page-header";
import { GettingStarted } from "@/components/features/home/getting-started";
import { HomeIcon } from "@/components/ui/icons";
import { Skeleton } from "@/components/ui/shimmer-loader";
import { getSessionContext } from "@/lib/auth/session";
import { getSetupProgress } from "@/lib/onboarding/setup";

export const metadata: Metadata = { title: "Home" };

export default function HomePage() {
  return (
    <>
      <PageHeader icon={HomeIcon} title="Home" />
      <PageBody>
        <Suspense
          fallback={
            <Skeleton
              width="100%"
              height="calc(var(--spacing-row) * 7)"
              radius="var(--radius-lg)"
            />
          }
        >
          <SetupChecklist />
        </Suspense>
      </PageBody>
    </>
  );
}

async function SetupChecklist() {
  const { currentOrg } = await getSessionContext();
  return <GettingStarted progress={await getSetupProgress(currentOrg.id)} />;
}
