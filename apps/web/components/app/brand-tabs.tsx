"use client";

import { type ViewTab, ViewTabs } from "@/components/app/view-tabs";
import { WithPathname } from "@/components/app/with-pathname";

type BrandSection = "overview" | "products" | "pages" | "dna";

const SECTIONS: { id: BrandSection; label: string; path: string }[] = [
  { id: "overview", label: "Overview", path: "" },
  { id: "products", label: "Products", path: "/products" },
  { id: "pages", label: "Pages", path: "/pages" },
  { id: "dna", label: "Brand DNA", path: "/dna" },
];

/**
 * A brand's sections (Figma Brands Details): Overview, Products, Pages and Brand DNA as underline
 * tabs on a hairline, the current one in Heading-01 over the 2 px line, the others Heading-04.
 * The current one follows the URL, so a product page keeps Products underlined.
 */
export function BrandTabs({ brandId }: { brandId: string }) {
  const tabs: ViewTab<BrandSection>[] = SECTIONS.map((section) => ({
    id: section.id,
    label: section.label,
    href: `/brands/${brandId}${section.path}`,
  }));
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

/** The same bar while the brand loads: the tab names in place, none underlined yet. */
export function BrandTabsPlaceholder() {
  return (
    <div aria-hidden className="flex h-9 items-center divider-b-thin">
      <div className="flex h-full gap-8">
        {SECTIONS.map((section) => (
          <span
            key={section.id}
            className="flex h-full items-center text-type-body-small font-medium text-heading-04"
          >
            {section.label}
          </span>
        ))}
      </div>
    </div>
  );
}
