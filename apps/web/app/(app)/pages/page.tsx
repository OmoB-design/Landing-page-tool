import type { Metadata } from "next";
import { Suspense } from "react";

import {
  PagesView,
  type PagesViewId,
  PagesViewSkeleton,
} from "@/components/features/pages/pages-view";
import { parsePageDisplay } from "@/lib/pages/display";
import { parsePageFilters } from "@/lib/pages/list";

export const metadata: Metadata = { title: "Pages" };

export default function PagesPage({ searchParams }: PageProps<"/pages">) {
  return (
    <Suspense fallback={<PagesViewSkeleton />}>
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
