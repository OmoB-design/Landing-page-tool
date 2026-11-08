import type { Metadata } from "next";
import { Suspense } from "react";

import { PageHeader } from "@/components/app/page-header";
import { SkeletonStatus } from "@/components/app/skeletons";
import {
  AccountSettings,
  AccountSettingsSkeleton,
} from "@/components/features/settings/account";
import { SettingsIcon } from "@/components/ui/icons";
import { getSessionContext } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Account · Settings" };

/** Settings → Account (B6.2, D130). */
export default function AccountPage() {
  return (
    <>
      <PageHeader icon={SettingsIcon} title="Settings" tools={false} />
      <Suspense
        fallback={
          <>
            <SkeletonStatus label="Loading your account" />
            <AccountSettingsSkeleton />
          </>
        }
      >
        <Account />
      </Suspense>
    </>
  );
}

async function Account() {
  const { user } = await getSessionContext();
  return <AccountSettings name={user.displayName} email={user.email} />;
}
