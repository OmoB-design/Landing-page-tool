import { type ReactNode, Suspense } from "react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDownIcon } from "@/components/ui/icons";
import { Skeleton } from "@/components/ui/shimmer-loader";
import { getSessionContext } from "@/lib/auth/session";
import { getOrgBrands } from "@/lib/brands/queries";

import { BrandMark } from "./brand-mark";
import { NavItem, SidebarAction, SidebarHeader } from "./sidebar-parts";

const VISIBLE_BRANDS = 5;

/** The secondary navigation (DESIGN.md §2). Rendered in the desktop column and the mobile sheet. */
export function SidebarNav() {
  return (
    <div className="flex flex-col gap-3 p-3">
      <SidebarHeader />
      <SidebarAction />
      <nav aria-label="Workspace" className="flex flex-col gap-3">
        <div className="flex flex-col gap-px">
          <NavItem href="/home" icon="home" label="Home" />
          <NavItem href="/pages?view=mine" icon="my-pages" label="My pages" />
        </div>
        <NavGroup label="Workspace">
          <NavItem href="/brands" icon="brands" label="Brands" />
          <NavItem href="/templates" icon="templates" label="Templates" />
          <NavItem href="/library" icon="library" label="Library" />
          <NavItem href="/analytics" icon="analytics" label="Analytics" />
        </NavGroup>
        <NavGroup label="Brands">
          <Suspense
            fallback={
              <Skeleton
                height="var(--spacing-nav-item)"
                radius="var(--radius-sm)"
              />
            }
          >
            <BrandLinks />
          </Suspense>
        </NavGroup>
      </nav>
    </div>
  );
}

/** A collapsible group with a muted 13 px label and chevron. */
function NavGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Collapsible defaultOpen className="flex flex-col gap-px">
      <CollapsibleTrigger className="group flex h-7 items-center gap-1 rounded-sm px-2 text-sm text-fg-muted hover:bg-surface-hover">
        {label}
        <ChevronDownIcon
          aria-hidden
          className="size-3.5 transition-transform duration-150 ease-out group-data-closed:-rotate-90 motion-reduce:transition-none"
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-px">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

/** The current org's brands, each with its emoji; long lists end in "More". */
async function BrandLinks() {
  const { currentOrg } = await getSessionContext();
  const brands = await getOrgBrands(currentOrg.id);

  if (brands.length === 0) {
    return <p className="px-2 py-1 text-sm text-fg-subtle">No brands yet</p>;
  }
  return (
    <>
      {brands.slice(0, VISIBLE_BRANDS).map((brand) => (
        <NavItem
          key={brand.id}
          href={`/brands/${brand.id}`}
          label={brand.name}
          leading={
            <BrandMark
              name={brand.name}
              emoji={brand.emoji}
              color={brand.primary}
            />
          }
        />
      ))}
      {brands.length > VISIBLE_BRANDS ? (
        <NavItem href="/brands" label="More" />
      ) : null}
    </>
  );
}
