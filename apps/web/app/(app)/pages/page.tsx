import type { Metadata } from "next";
import { Suspense } from "react";

import { PageHeader } from "@/components/app/page-header";
import {
  PagesView,
  type PagesViewId,
} from "@/components/features/pages/pages-view";
import { PagesIcon } from "@/components/ui/icons";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Pages" };

export default function PagesPage({ searchParams }: PageProps<"/pages">) {
  return (
    <Suspense fallback={<PagesFallback />}>
      <PagesContent searchParams={searchParams} />
    </Suspense>
  );
}

async function PagesContent({
  searchParams,
}: Pick<PageProps<"/pages">, "searchParams">) {
  const { view } = await searchParams;
  const viewId: PagesViewId = view === "mine" ? "mine" : "all";
  return <PagesView view={viewId} />;
}

function PagesFallback() {
  return (
    <>
      <PageHeader icon={PagesIcon} title="Pages" />
      <div className="flex flex-col gap-2 px-6 py-4">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-row w-full" />
        <Skeleton className="h-row w-full" />
      </div>
    </>
  );
}
