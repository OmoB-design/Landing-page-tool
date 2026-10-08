import type { Metadata } from "next";
import { Suspense } from "react";

import { PageHeader } from "@/components/app/page-header";
import { DemoJobCard } from "@/components/features/home/demo-job-card";
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
      <div className="flex flex-col gap-6 px-6 py-6">
        <Suspense
          fallback={
            <Skeleton
              width="var(--container-xl)"
              height="calc(var(--spacing-row) * 7)"
              radius="var(--radius-lg)"
            />
          }
        >
          <SetupChecklist />
        </Suspense>
        <DemoJobCard />
      </div>
    </>
  );
}

async function SetupChecklist() {
  const { currentOrg } = await getSessionContext();
  return <GettingStarted progress={await getSetupProgress(currentOrg.id)} />;
}
