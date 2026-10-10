import type { Metadata } from "next";
import { Suspense } from "react";

import { PageBody } from "@/components/app/page-body";
import { PageHeader } from "@/components/app/page-header";
import { Welcome } from "@/components/features/home/welcome";
import { HomeIcon } from "@/components/ui/icons";
import { Skeleton } from "@/components/ui/shimmer-loader";
import { getSessionContext } from "@/lib/auth/session";
import { getSetupProgress } from "@/lib/onboarding/setup";

export const metadata: Metadata = { title: "Home" };

export default function HomePage() {
  return (
    <>
      <PageHeader icon={HomeIcon} title="Home" />
      <PageBody width="xl" className="gap-10 py-12">
        <Suspense
          fallback={
            <Skeleton
              width="100%"
              height="calc(var(--spacing-row) * 9)"
              radius="var(--radius-lg)"
            />
          }
        >
          <HomeContent />
        </Suspense>
      </PageBody>
    </>
  );
}

async function HomeContent() {
  const { user, currentOrg } = await getSessionContext();
  const progress = await getSetupProgress(currentOrg.id);
  return <Welcome name={user.displayName} progress={progress} />;
}
