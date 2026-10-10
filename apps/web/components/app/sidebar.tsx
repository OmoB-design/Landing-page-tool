import { type ReactNode, Suspense } from "react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { CaretIcon } from "@/components/ui/icons";
import { Skeleton } from "@/components/ui/shimmer-loader";
import { getSessionContext } from "@/lib/auth/session";
import { getOrgBrands } from "@/lib/brands/queries";
import { getSetupProgress } from "@/lib/onboarding/setup";

import { BrandMark } from "./brand-mark";
import { JobTray } from "./job-tray";
import { NotificationsButton } from "./notifications-button";
import { OrgSwitcher } from "./org-switcher";
import { NavItem, SearchItem } from "./sidebar-parts";
import { SidebarSetup } from "./sidebar-setup";
import { SidebarToggleButton } from "./sidebar-state";
import { UserMenu } from "./user-menu";

const VISIBLE_BRANDS = 6;

/**
 * The sidebar (DESIGN.md §2, D67): the workspace menu and collapse on top; Home, New page,
 * Search, Notifications and Jobs; the Workspace and Your brands groups; Settings and the account
 * at the bottom, with the getting-started card above them until every step is done.
 * Rendered in the desktop column and in the mobile sheet.
 */
export async function SidebarNav() {
  const { user, orgs, currentOrg } = await getSessionContext();
  const setup = await getSetupProgress(currentOrg.id);
  return (
    <div className="flex h-full w-full flex-col gap-4 px-2.5 pt-3.5 pb-3">
      <div className="flex items-center gap-1">
        <OrgSwitcher orgs={orgs} currentOrg={currentOrg} />
        <SidebarToggleButton action="close" className="ml-auto" />
      </div>
      <nav
        aria-label="Workspace"
        className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto"
      >
        <div className="flex flex-col gap-px">
          <NavItem href="/home" icon="home" label="Home" />
          <NavItem href="/pages/new" icon="new" label="New page" exact />
          <SearchItem />
          <NotificationsButton variant="row" />
          <JobTray userId={user.id} variant="row" />
        </div>
        <NavGroup label="Workspace">
          <NavItem href="/pages" icon="pages" label="Pages" />
          <NavItem href="/templates" icon="templates" label="Templates" />
          <NavItem href="/brands" icon="brands" label="Brands" exact />
          <NavItem href="/library" icon="library" label="Library" />
          <NavItem href="/analytics" icon="analytics" label="Analytics" />
        </NavGroup>
        <NavGroup label="Your brands">
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
      <div className="flex flex-col gap-3">
        <SidebarSetup
          steps={setup.steps}
          done={setup.done}
          total={setup.total}
        />
        <div className="flex flex-col gap-px">
          <NavItem href="/settings" icon="settings" label="Settings" />
          <UserMenu
            variant="row"
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
      </div>
    </div>
  );
}

/** A collapsible group: a muted 12 px label with a small caret, like the reference. */
function NavGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Collapsible defaultOpen className="flex flex-col gap-px">
      <CollapsibleTrigger className="group flex h-7 items-center gap-1.5 self-start rounded-sm px-2 text-sm text-fg-muted hover:text-fg">
        {label}
        <CaretIcon
          aria-hidden
          className="size-2 rotate-180 fill-current transition-transform duration-150 ease-out group-data-closed:rotate-90 motion-reduce:transition-none"
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-px">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

/** The current org's brands with their colour marks; long lists end in "All brands". */
async function BrandLinks() {
  const { currentOrg } = await getSessionContext();
  const brands = await getOrgBrands(currentOrg.id);

  if (brands.length === 0) {
    return <p className="px-2 py-1 text-base text-fg-muted">No brands yet.</p>;
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
        <NavItem href="/brands" label="All brands" />
      ) : null}
    </>
  );
}
