"use client";

import { type ViewTab, ViewTabs } from "@/components/app/view-tabs";
import { WithPathname } from "@/components/app/with-pathname";

type BrandSection = "overview" | "products" | "pages" | "dna";

/**
 * A brand's sections (Figma Brands Details): Overview, Products, Pages and Brand DNA as underline
 * tabs on a hairline, the current one in Heading-01 over the 2 px line, the others Heading-04.
 * The current one follows the URL, so a product page keeps Products underlined.
 */
export function BrandTabs({ brandId }: { brandId: string }) {
  const base = `/brands/${brandId}`;
  const tabs: ViewTab<BrandSection>[] = [
    { id: "overview", label: "Overview", href: base },
    { id: "products", label: "Products", href: `${base}/products` },
    { id: "pages", label: "Pages", href: `${base}/pages` },
    { id: "dna", label: "Brand DNA", href: `${base}/dna` },
  ];
  const activeFor = (pathname: string): BrandSection =>
    tabs.find((tab) => tab.id !== "overview" && pathname.startsWith(tab.href))
      ?.id ?? "overview";
  return (
    <div className="flex h-9 items-center divider-b-thin">
      <WithPathname
        // Before the URL is known, nothing is underlined (not Overview, which would flash).
        fallback={
          <ViewTabs<BrandSection | "">
            label="Brand sections"
            tabs={tabs}
            active=""
            muted
          />
        }
      >
        {(pathname) => (
          <ViewTabs
            label="Brand sections"
            tabs={tabs}
            active={activeFor(pathname)}
            muted
          />
        )}
      </WithPathname>
    </div>
  );
}
