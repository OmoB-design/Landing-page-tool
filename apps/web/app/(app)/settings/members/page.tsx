import type { Metadata } from "next";
import { Suspense } from "react";

import { PageHeader } from "@/components/app/page-header";
import { SkeletonStatus } from "@/components/app/skeletons";
import {
  MembersSettings,
  MembersSettingsSkeleton,
} from "@/components/features/settings/members";
import { Unreachable } from "@/components/features/settings/unreachable";
import { SettingsIcon } from "@/components/ui/icons";
import { getSessionContext } from "@/lib/auth/session";
import { publicEnv } from "@/lib/env";
import { withLinks } from "@/lib/members/answer";

import { loadMembers } from "../_load";

export const metadata: Metadata = { title: "Members · Settings" };

/** Settings → Members (B6.1, D129). */
export default function MembersPage() {
  return (
    <>
      <PageHeader icon={SettingsIcon} title="Settings" tools={false} />
      <Suspense
        fallback={
          <>
            <SkeletonStatus label="Loading members" />
            <MembersSettingsSkeleton />
          </>
        }
      >
        <Members />
      </Suspense>
    </>
  );
}

async function Members() {
  const { currentOrg } = await getSessionContext();
  const state = await loadMembers(currentOrg.id);
  if (!state) return <Unreachable />;
  // Invite links as the API makes them: the public domain, else the app's own address.
  return (
    <MembersSettings
      initial={withLinks(state, new Request(publicEnv.appUrl))}
    />
  );
}
