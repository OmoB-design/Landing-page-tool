import type { ReactNode } from "react";

import { getSessionContext } from "@/lib/auth/session";
import { getOrgBrands } from "@/lib/brands/queries";
import { getSetupProgress } from "@/lib/onboarding/setup";

import { JobToasts } from "./job-tray";
import { BrandNavMark } from "./mark";
import { OrgSwitcher } from "./org-switcher";
import { NavGroup, NavItem, SearchButton } from "./sidebar-parts";
import { SidebarSetup } from "./sidebar-setup";
import { SidebarToggleButton } from "./sidebar-state";
import { UserMenu } from "./user-menu";

const VISIBLE_BRANDS = 6;

/**
 * The sidebar (Figma: Side Nav; DESIGN.md §2). Top row, 12 px down and 8 px in: the workspace
 * menu, Search and the collapse button. Then, 8 px in and 2 px apart: Home and New page; the
 * Workspace group (Pages, Templates, Brands, Library, Analytics) and Your brands, 16 px above each. At the
 * bottom, 6 px from the edges: the getting-started card (until every step is done) above the
 * profile card, 8 px apart. Jobs and Notifications live in the page header. Rendered in the
 * desktop column and in the mobile sheet. Everything that needs the session arrives together.
 */
export async function SidebarNav() {
  const { user, orgs, currentOrg } = await getSessionContext();
  const [setup, brands] = await Promise.all([
    getSetupProgress(currentOrg.id),
    getOrgBrands(currentOrg.id),
  ]);
  const showSetup = setup.done < setup.total;
  return (
    <SidebarFrame
      workspace={<OrgSwitcher orgs={orgs} currentOrg={currentOrg} />}
      brands={<BrandLinks brands={brands} />}
      footer={
        <>
          <div
            className={
              showSetup
                ? "flex flex-col gap-2 px-2 pb-1.5"
                : "flex flex-col px-1.5 pb-1.5"
            }
          >
            <SidebarSetup
              steps={setup.steps}
              done={setup.done}
              total={setup.total}
            />
            <UserMenu
              name={user.displayName}
              email={user.email}
              setup={{
                done: setup.done,
                total: setup.total,
                nextLabel: setup.next?.label,
                nextHref: setup.next?.href,
              }}
            />
          </div>
          <JobToasts userId={user.id} />
        </>
      }
    />
  );
}

/**
 * The sidebar while the session loads: the same links, with the workspace name, brands and
 * profile held back (no shimmer) until they arrive together.
 */
export function SidebarSkeleton() {
  return (
    <SidebarFrame
      workspace={
        // Keeps the top row at the workspace menu's height.
        <span
          aria-hidden
          className="invisible flex items-center gap-1.5 px-1 py-0.5"
        >
          <span className="size-4.5" />
          <span className="text-type-body-large font-medium">Workspace</span>
        </span>
      }
    />
  );
}

function SidebarFrame({
  workspace,
  brands,
  footer,
}: {
  workspace: ReactNode;
  brands?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="flex h-full w-full flex-col justify-between bg-dashboard">
      <div className="flex min-h-0 flex-col">
        <div className="flex items-center justify-between px-2 py-3">
          {workspace}
          <div className="flex shrink-0 items-center gap-0.75">
            <SearchButton />
            <SidebarToggleButton action="close" />
          </div>
        </div>
        <nav
          aria-label="Workspace"
          className="flex min-h-0 flex-col gap-0.5 overflow-y-auto p-2"
        >
          <NavItem href="/home" icon="home" label="Home" />
          <NavItem href="/pages/new" icon="new" label="New page" exact />
          <NavGroup label="Workspace">
            <NavItem href="/pages" icon="pages" label="Pages" />
            <NavItem href="/templates" icon="templates" label="Templates" />
            <NavItem href="/brands" icon="brands" label="Brands" exact />
            <NavItem href="/library" icon="library" label="Library" />
            <NavItem href="/analytics" icon="analytics" label="Analytics" />
          </NavGroup>
          <NavGroup label="Your brands">{brands}</NavGroup>
        </nav>
      </div>
      {footer}
    </div>
  );
}

/** The current org's brands with their letter marks; long lists end in "All brands". */
function BrandLinks({
  brands,
}: {
  brands: Awaited<ReturnType<typeof getOrgBrands>>;
}) {
  if (brands.length === 0) {
    return (
      <p className="px-2 py-1 text-type-body-small font-medium text-heading-05">
        No brands yet.
      </p>
    );
  }
  return (
    <>
      {brands.slice(0, VISIBLE_BRANDS).map((brand) => (
        <NavItem
          key={brand.id}
          href={`/brands/${brand.id}`}
          label={brand.name}
          leading={<BrandNavMark name={brand.name} />}
        />
      ))}
      {brands.length > VISIBLE_BRANDS ? (
        <NavItem href="/brands" label="All brands" />
      ) : null}
    </>
  );
}
