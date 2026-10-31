import type { Metadata } from "next";
import { Suspense } from "react";

import {
  LibraryView,
  LibraryViewSkeleton,
} from "@/components/features/library/library-view";
import { LIBRARY_PAGE, parseLibraryFilters } from "@/lib/library/href";

export const metadata: Metadata = { title: "Library" };

/** /library: every page with what it cost (BUILD_SPEC §14). */
export default function LibraryPage({ searchParams }: PageProps<"/library">) {
  return (
    <Suspense fallback={<LibraryViewSkeleton />}>
      <Library searchParams={searchParams} />
    </Suspense>
  );
}

async function Library({
  searchParams,
}: Pick<PageProps<"/library">, "searchParams">) {
  const params = await searchParams;
  const show = Math.min(
    Math.max(Number(params.show) || LIBRARY_PAGE, LIBRARY_PAGE),
    1000,
  );
  return <LibraryView filters={parseLibraryFilters(params)} show={show} />;
}
