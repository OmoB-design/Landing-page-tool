import { Suspense } from "react";

import { getSessionContext } from "@/lib/auth/session";
import { getOrgBrands } from "@/lib/brands/queries";
import { getSetupProgress } from "@/lib/onboarding/setup";

import { JobToasts } from "./job-tray";
import { BrandNavMark } from "./mark";
import { OrgSwitcher } from "./org-switcher";
import { NavGroup, NavItem, SearchButton } from "./sidebar-parts";
import { SidebarSetup } from "./sidebar-setup";
import { SkeletonMark, SkeletonText } from "./skeletons";
import { SidebarToggleButton } from "./sidebar-state";
import { UserMenu } from "./user-menu";

const VISIBLE_BRANDS = 6;

/**
 * The sidebar (Figma: Side Nav; DESIGN.md §2). Top row, 12 px down and 8 px in: the workspace
 * menu, Search and the collapse button. Then, 8 px in and 2 px apart: Home and New page; the
 * Workspace group (Pages, Templates, Brands, Library, Analytics) and Your brands, 16 px above each. At the
 * bottom, 6 px from the edges: the getting-started card (until every step is done) above the
 * profile card, 8 px apart. Jobs and Notifications live in the page header. Rendered in the
 * desktop column and in the mobile sheet.
 */
export function SidebarNav() {
  return (
    <div className="flex h-full w-full flex-col justify-between bg-dashboard">
      <div className="flex min-h-0 flex-col">
        <div className="flex items-center justify-between px-2 py-3">
          <Suspense fallback={<OrgSwitcherSkeleton />}>
            <Workspace />
          </Suspense>
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
          <NavGroup label="Your brands">
            <Suspense fallback={<BrandLinksSkeleton />}>
              <BrandLinks />
            </Suspense>
          </NavGroup>
        </nav>
      </div>
      <Suspense fallback={<FooterSkeleton />}>
        <Footer />
      </Suspense>
    </div>
  );
}

/** The workspace menu, once the session is known. */
async function Workspace() {
  const { orgs, currentOrg } = await getSessionContext();
  return <OrgSwitcher orgs={orgs} currentOrg={currentOrg} />;
}

/** The getting-started card (until every step is done) above the profile card; job toasts. */
async function Footer() {
  const { user, currentOrg } = await getSessionContext();
  const setup = await getSetupProgress(currentOrg.id);
  const showSetup = setup.done < setup.total;
  return (
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
  );
}

/** The workspace menu while the session loads: the 18 px mark and the name, as in the trigger. */
function OrgSwitcherSkeleton() {
  return (
    <span aria-hidden className="flex min-w-0 items-center gap-1.5 px-1 py-0.5">
      <SkeletonMark size={18} />
      <SkeletonText className="text-type-body-large" width={104} />
    </span>
  );
}

/** Brand rows while they load: the 16 px mark and the name, on the nav row's 20 px line. */
function BrandLinksSkeleton() {
  return (
    <>
      {[72, 56].map((width) => (
        <span
          key={width}
          aria-hidden
          className="flex items-center gap-1.5 px-2 py-1"
        >
          <SkeletonMark size={16} />
          <SkeletonText
            className="text-type-body-small leading-5"
            width={width}
          />
        </span>
      ))}
    </>
  );
}

/** The profile card while the session loads: the 30 px avatar, the name and the email. */
function FooterSkeleton() {
  return (
    <div aria-hidden className="flex flex-col px-1.5 pb-1.5">
      <div className="flex items-center gap-2.5 rounded-lg bg-surface-primary p-1.5 edge">
        <SkeletonMark size={30} round />
        <span className="flex min-w-0 flex-1 flex-col">
          <SkeletonText className="text-type-caption-1" width={96} />
          <SkeletonText className="text-type-caption-3" width={136} />
        </span>
      </div>
    </div>
  );
}

/** The current org's brands with their letter marks; long lists end in "All brands". */
async function BrandLinks() {
  const { currentOrg } = await getSessionContext();
  const brands = await getOrgBrands(currentOrg.id);

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
