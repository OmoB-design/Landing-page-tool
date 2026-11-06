import type { Metadata } from "next";
import { Suspense } from "react";

import {
  BatchView,
  BatchViewSkeleton,
} from "@/components/features/builds/batch-view";
import { getSessionContext } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Batch" };

/** /pages/batch/[batchId]: the pages a batch started, building together (B3.5, D115). */
export default function BatchPage({
  params,
}: PageProps<"/pages/batch/[batchId]">) {
  return (
    <Suspense fallback={<BatchViewSkeleton />}>
      <Batch params={params} />
    </Suspense>
  );
}

async function Batch({
  params,
}: Pick<PageProps<"/pages/batch/[batchId]">, "params">) {
  const [{ batchId }, { user }] = await Promise.all([
    params,
    getSessionContext(),
  ]);
  return (
    <BatchView batchId={batchId} me={{ id: user.id, name: user.displayName }} />
  );
}
