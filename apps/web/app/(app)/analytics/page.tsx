import type { Metadata } from "next";
import { Suspense } from "react";

import {
  AnalyticsView,
  AnalyticsViewSkeleton,
} from "@/components/features/analytics/analytics-view";
import { getAnalytics } from "@/lib/api/worker";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { analyticsRangeSchema } from "@/lib/validators/analytics";

export const metadata: Metadata = { title: "Analytics" };

/** /analytics: spend over time, by brand, template and kind, and pages (BUILD_SPEC §14). */
export default function AnalyticsPage({
  searchParams,
}: PageProps<"/analytics">) {
  return (
    <Suspense fallback={<AnalyticsViewSkeleton />}>
      <Analytics searchParams={searchParams} />
    </Suspense>
  );
}

async function Analytics({
  searchParams,
}: Pick<PageProps<"/analytics">, "searchParams">) {
  const { range } = await searchParams;
  const parsed = analyticsRangeSchema.safeParse(range);
  const { currentOrg } = await getSessionContext();
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const data = session
    ? await getAnalytics(
        session.access_token,
        currentOrg.id,
        parsed.success ? parsed.data : "30d",
      ).catch(() => null)
    : null;
  return <AnalyticsView data={data} />;
}
