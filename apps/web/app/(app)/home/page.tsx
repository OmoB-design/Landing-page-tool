import type { Metadata } from "next";
import { Suspense } from "react";

import { PageBody } from "@/components/app/page-body";
import { PageHeader } from "@/components/app/page-header";
import { Welcome } from "@/components/features/home/welcome";
import { HomeIcon } from "@/components/ui/icons";
import { getSessionContext } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Home" };

export default function HomePage() {
  return (
    <>
      <PageHeader icon={HomeIcon} title="Home" />
      <PageBody width="xl" className="gap-10 py-12">
        <Suspense fallback={<Welcome name={null} />}>
          <HomeContent />
        </Suspense>
      </PageBody>
    </>
  );
}

async function HomeContent() {
  const { user } = await getSessionContext();
  return <Welcome name={user.displayName} />;
}
