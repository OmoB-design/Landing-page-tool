import { SearchIcon } from "@/components/ui/icons";
import { getSessionContext } from "@/lib/auth/session";
import { getSetupProgress } from "@/lib/onboarding/setup";

import { JobTray } from "./job-tray";
import { NotificationsButton } from "./notifications-button";
import { OrgSwitcher } from "./org-switcher";
import { SidebarToggleButton } from "./sidebar-state";
import { UserMenu } from "./user-menu";

/** 48 px top bar: org switcher, centred search, notifications, account (DESIGN.md §2). */
export async function TopBar() {
  const { user, orgs, currentOrg } = await getSessionContext();
  const setup = await getSetupProgress(currentOrg.id);

  return (
    <header className="flex h-topbar shrink-0 items-center gap-2 px-3">
      {/* Opens the sidebar on small screens, or when it has been collapsed on desktop. */}
      <SidebarToggleButton
        action="open"
        className="lg:hidden lg:sidebar-collapsed:inline-flex"
      />
      <OrgSwitcher orgs={orgs} currentOrg={currentOrg} />
      <div className="hidden flex-1 justify-center px-4 sm:flex">
        <SearchBox orgName={currentOrg.name} />
      </div>
      <div className="ml-auto flex items-center gap-1 sm:ml-0">
        <JobTray userId={user.id} />
        <NotificationsButton />
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
    </header>
  );
}

/** Search placeholder. The ⌘K command palette replaces it in a later build. */
function SearchBox({ orgName }: { orgName: string }) {
  return (
    <label className="flex h-8 w-full max-w-md items-center gap-2 rounded-md bg-surface-muted px-3 text-fg-subtle">
      <SearchIcon aria-hidden className="size-4 shrink-0" />
      <input
        type="search"
        readOnly
        placeholder={`Search ${orgName}`}
        aria-label={`Search ${orgName} (not built yet)`}
        className="w-full bg-transparent text-base text-fg placeholder:text-fg-subtle"
      />
    </label>
  );
}
