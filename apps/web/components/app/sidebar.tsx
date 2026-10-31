import type { ReactNode } from "react";

import { getSessionContext } from "@/lib/auth/session";
import { getOrgBrands } from "@/lib/brands/queries";
import { getSetupProgress } from "@/lib/onboarding/setup";

import { JobToasts } from "./job-tray";
import { BrandNavMark } from "./mark";
import { OrgSwitcher } from "./org-switcher";
import { railIndex } from "./rail";
import { NavGroup, NavItem, SearchButton } from "./sidebar-parts";
import { SidebarSetup } from "./sidebar-setup";
import { SidebarToggleButton } from "./sidebar-state";
import { UserMenu } from "./user-menu";

const VISIBLE_BRANDS = 6;
// Places from the top for the rail's staggered labels (D97): the workspace name is 0.
const FIRST_BRAND_ROW = 10;

/**
 * The sidebar (Figma: Side Nav; DESIGN.md §2). Top row, 12 px down and 8 px in: the workspace
 * menu, Search and the collapse button. Then, 8 px in and 2 px apart: Home and New page; the
 * Workspace group (Pages, Templates, Brands, Library, Analytics) and Your brands, 16 px above each. At the
 * bottom, 6 px from the edges: the getting-started card (until every step is done) above the
 * profile card, 8 px apart. Jobs and Notifications live in the page header. Rendered in the
 * desktop column and in the mobile sheet. Everything that needs the session arrives together.
 * Collapsed, the desktop column is the icon rail (D97): labels, headings and the getting-started
 * card fade out in order (`index` is each one's place from the top) and the profile card is its
 * picture.
 */
export async function SidebarNav() {
  const { user, orgs, currentOrg } = await getSessionContext();
  const [setup, brands] = await Promise.all([
    getSetupProgress(currentOrg.id),
    getOrgBrands(currentOrg.id),
  ]);
  const showSetup = setup.done < setup.total;
  // The footer's labels come after the last brand row in the rail's stagger.
  const brandRows =
    brands.length === 0
      ? 1
      : Math.min(brands.length, VISIBLE_BRANDS) +
        (brands.length > VISIBLE_BRANDS ? 1 : 0);
  return (
    <SidebarFrame
      workspace={<OrgSwitcher orgs={orgs} currentOrg={currentOrg} />}
      brands={<BrandLinks brands={brands} />}
      footer={
        <>
          {/* In the rail the profile card sits 6 px in either way, so its picture centres on
              the icons. */}
          <div
            style={railIndex(FIRST_BRAND_ROW + brandRows)}
            className={
              showSetup
                ? "flex flex-col gap-2 px-2 pb-1.5 rail:px-1.5"
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
        {/* Search and Collapse ride the right edge and fade as a group; in the rail only the
            workspace mark stays (the page header's button opens the sidebar again). */}
        <div className="relative flex items-center px-2 py-3">
          <div className="flex min-w-0 flex-1 pr-14 rail:pr-0">{workspace}</div>
          <div className="rail-meta absolute inset-y-0 right-2 flex items-center gap-0.75">
            <SearchButton />
            <SidebarToggleButton action="close" />
          </div>
        </div>
        <nav
          aria-label="Workspace"
          className="flex min-h-0 flex-col gap-0.5 overflow-y-auto p-2"
        >
          <NavItem href="/home" icon="home" label="Home" index={1} />
          <NavItem
            href="/pages/new"
            icon="new"
            label="New page"
            exact
            index={2}
          />
          <NavGroup label="Workspace" index={3}>
            <NavItem href="/pages" icon="pages" label="Pages" index={4} />
            <NavItem
              href="/templates"
              icon="templates"
              label="Templates"
              index={5}
            />
            <NavItem
              href="/brands"
              icon="brands"
              label="Brands"
              exact
              index={6}
            />
            <NavItem href="/library" icon="library" label="Library" index={7} />
            <NavItem
              href="/analytics"
              icon="analytics"
              label="Analytics"
              index={8}
            />
          </NavGroup>
          <NavGroup label="Your brands" index={FIRST_BRAND_ROW - 1}>
            {brands}
          </NavGroup>
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
      <p
        style={railIndex(FIRST_BRAND_ROW)}
        className="rail-gone rail-label px-2 py-1 text-type-body-small font-medium whitespace-nowrap text-heading-05"
      >
        No brands yet.
      </p>
    );
  }
  return (
    <>
      {brands.slice(0, VISIBLE_BRANDS).map((brand, i) => (
        <NavItem
          key={brand.id}
          href={`/brands/${brand.id}`}
          label={brand.name}
          leading={<BrandNavMark name={brand.name} />}
          index={FIRST_BRAND_ROW + i}
        />
      ))}
      {brands.length > VISIBLE_BRANDS ? (
        <NavItem
          href="/brands"
          label="All brands"
          index={FIRST_BRAND_ROW + VISIBLE_BRANDS}
        />
      ) : null}
    </>
  );
}
