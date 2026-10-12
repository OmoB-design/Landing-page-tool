import type { Metadata } from "next";
import { Suspense } from "react";

import { PageHeader } from "@/components/app/page-header";
import {
  PagesView,
  type PagesViewId,
} from "@/components/features/pages/pages-view";
import { PagesIcon } from "@/components/ui/icons";
import { Skeleton } from "@/components/ui/shimmer-loader";
import { parsePageDisplay } from "@/lib/pages/display";
import { parsePageFilters } from "@/lib/pages/list";

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
  const params = await searchParams;
  const viewId: PagesViewId = params.view === "mine" ? "mine" : "all";
  // ?sample=1 shows every status with sample pages, in development only.
  const sample =
    process.env.NODE_ENV === "development" && params.sample === "1";
  return (
    <PagesView
      view={viewId}
      filters={parsePageFilters(params)}
      display={parsePageDisplay(params)}
      sample={sample}
    />
  );
}

function PagesFallback() {
  return (
    <>
      <PageHeader icon={PagesIcon} title="Pages" />
      <div className="flex flex-col gap-2 px-6 py-4">
        <Skeleton height="calc(var(--spacing) * 9)" radius="var(--radius-sm)" />
        <Skeleton height="var(--spacing-row)" radius="var(--radius-sm)" />
        <Skeleton height="var(--spacing-row)" radius="var(--radius-sm)" />
      </div>
    </>
  );
}
