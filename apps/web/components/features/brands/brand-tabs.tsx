"use client";

import { SegmentedTabs } from "@/components/app/segmented-tabs";
import { WithPathname } from "@/components/app/with-pathname";

/** Brand page tabs (DESIGN.md §3); the active one follows the URL. */
export function BrandTabs({ brandId }: { brandId: string }) {
  const base = `/brands/${brandId}`;
  const tabs = [
    { id: "overview", label: "Overview", href: base },
    { id: "products", label: "Products", href: `${base}/products` },
    { id: "pages", label: "Pages", href: `${base}/pages` },
    { id: "dna", label: "Brand DNA", href: `${base}/dna` },
  ];
  const activeFor = (pathname: string) =>
    tabs.find((tab) => tab.id !== "overview" && pathname.startsWith(tab.href))
      ?.id ?? "overview";
  return (
    <WithPathname
      fallback={<SegmentedTabs label="Brand sections" tabs={tabs} active="" />}
    >
      {(pathname) => (
        <SegmentedTabs
          label="Brand sections"
          tabs={tabs}
          active={activeFor(pathname)}
        />
      )}
    </WithPathname>
  );
}
