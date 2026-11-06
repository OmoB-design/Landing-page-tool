import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense, cache } from "react";

import {
  ReviewGone,
  ReviewLoading,
  ReviewView,
} from "@/components/features/review/review-view";
import { WorkerError, getReviewInfo } from "@/lib/api/worker";

// The client review link (B3.6, D119): no sign-in; the token in the address is checked by the
// worker. One call per visit (it counts the visit) serves both the tab's title and the page;
// undefined when the worker can't be reached.
const load = cache(async (token: string) => {
  await connection(); // at request time: the link can be turned off or expire at any moment
  try {
    return await getReviewInfo(token);
  } catch (error) {
    if (error instanceof WorkerError) return undefined;
    throw error;
  }
});

export async function generateMetadata({
  params,
}: PageProps<"/review/[token]">): Promise<Metadata> {
  const info = await load((await params).token);
  return {
    // The client's page carries none of our branding.
    title: { absolute: info?.title ?? "Page review" },
    robots: { index: false, follow: false },
    referrer: "no-referrer",
  };
}

export default function ReviewPage({ params }: PageProps<"/review/[token]">) {
  return (
    <Suspense fallback={<ReviewLoading />}>
      <Review params={params} />
    </Suspense>
  );
}

async function Review({
  params,
}: Pick<PageProps<"/review/[token]">, "params">) {
  const { token } = await params;
  const info = await load(token);
  if (!info) return <ReviewGone unreachable={info === undefined} />;
  return (
    <ReviewView
      token={token}
      title={info.title}
      approvedAt={info.approved_at}
    />
  );
}
