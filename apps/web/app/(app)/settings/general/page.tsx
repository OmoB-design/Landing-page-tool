import type { Metadata } from "next";
import { Suspense } from "react";

import { PageHeader } from "@/components/app/page-header";
import { SkeletonStatus } from "@/components/app/skeletons";
import { GeneralSettings } from "@/components/features/settings/general";
import { Unreachable } from "@/components/features/settings/unreachable";
import { SettingsIcon } from "@/components/ui/icons";
import { getSessionContext } from "@/lib/auth/session";

import { loadIntegrations } from "../_load";

export const metadata: Metadata = { title: "General · Settings" };

/** Settings → General (D88). */
export default function GeneralPage() {
  return (
    <>
      <PageHeader icon={SettingsIcon} title="Settings" />
      <Suspense fallback={<SkeletonStatus label="Loading settings" />}>
        <General />
      </Suspense>
    </>
  );
}

async function General() {
  const { currentOrg } = await getSessionContext();
  const state = await loadIntegrations(currentOrg.id);
  if (!state) return <Unreachable />;
  return (
    <GeneralSettings workspace={{ name: currentOrg.name }} initial={state} />
  );
}
