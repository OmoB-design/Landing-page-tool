import type { Metadata } from "next";
import { Suspense } from "react";

import { PageHeader } from "@/components/app/page-header";
import { SkeletonStatus } from "@/components/app/skeletons";
import {
  Connections,
  ConnectionsSkeleton,
} from "@/components/features/settings/connections";
import { Unreachable } from "@/components/features/settings/unreachable";
import { SettingsIcon } from "@/components/ui/icons";
import { getSessionContext } from "@/lib/auth/session";
import { getOrgBrands } from "@/lib/brands/queries";

import { loadIntegrations } from "../_load";

export const metadata: Metadata = { title: "Connections · Settings" };

/** Settings → Connections (D88): Vercel now, Shopify with B1.5b. */
export default function ConnectionsPage() {
  return (
    <>
      <PageHeader icon={SettingsIcon} title="Settings" />
      <Suspense
        fallback={
          <>
            <SkeletonStatus label="Loading connections" />
            <ConnectionsSkeleton />
          </>
        }
      >
        <ConnectionsContent />
      </Suspense>
    </>
  );
}

async function ConnectionsContent() {
  const { currentOrg } = await getSessionContext();
  const [state, brands] = await Promise.all([
    loadIntegrations(currentOrg.id),
    getOrgBrands(currentOrg.id),
  ]);
  if (!state) return <Unreachable />;
  return (
    <Connections
      initial={state}
      brands={Object.fromEntries(brands.map((brand) => [brand.id, brand.name]))}
    />
  );
}
