import type { Metadata } from "next";
import { Suspense } from "react";

import { PageHeader } from "@/components/app/page-header";
import { TrashSettings } from "@/components/features/settings/trash";
import { SettingsIcon } from "@/components/ui/icons";
import { getSessionContext } from "@/lib/auth/session";

import { loadTrash } from "../_load";

export const metadata: Metadata = { title: "Trash · Settings" };

/** Settings → Trash (D92): what was deleted in the last 7 days, to restore or delete for good. */
export default function TrashPage() {
  return (
    <>
      <PageHeader icon={SettingsIcon} title="Settings" />
      <Suspense fallback={<TrashSettings loading />}>
        <Trash />
      </Suspense>
    </>
  );
}

async function Trash() {
  const { currentOrg } = await getSessionContext();
  return <TrashSettings initial={await loadTrash(currentOrg.id)} />;
}
