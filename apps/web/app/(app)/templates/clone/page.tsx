import type { Metadata } from "next";
import { Suspense } from "react";

import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { SkeletonStatus } from "@/components/app/skeletons";
import { CloneFlow } from "@/components/features/templates/clone-flow";
import { AlertIcon, TemplatesIcon } from "@/components/ui/icons";
import { getCloneTerms } from "@/lib/api/worker";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Clone a page" };

/** /templates/clone (B2.1): clone a competitor's page into Yours. The flow lays itself out. */
export default function ClonePage() {
  return (
    <>
      <PageHeader
        icon={TemplatesIcon}
        title="Clone a page"
        crumb={{ label: "Templates", href: "/templates?view=yours" }}
      />
      <div className="pt-12 pb-12">
        <Suspense fallback={<SkeletonStatus label="Loading" />}>
          <Clone />
        </Suspense>
      </div>
    </>
  );
}

async function Clone() {
  const { currentOrg } = await getSessionContext();
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const terms = session
    ? await getCloneTerms(session.access_token, currentOrg.id).catch(() => null)
    : null;
  if (!terms) {
    return (
      <EmptyState icon={AlertIcon} title="Cloning isn’t available right now">
        The service that clones pages isn’t reachable. Try again in a minute.
      </EmptyState>
    );
  }
  return <CloneFlow initialTerms={terms} workspace={currentOrg.name} />;
}
