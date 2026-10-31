import { type ReactNode, Suspense } from "react";

import { MobileSidebar } from "./mobile-sidebar";
import { RememberPath } from "./remember-path";
import { ShellSidebar } from "./settings-sidebar";
import { SidebarNav, SidebarSkeleton } from "./sidebar";
import { SidebarProvider } from "./sidebar-state";

/**
 * The signed-in workspace (DESIGN.md §2, D67; Figma: Home): the 240 px sidebar on the grey canvas
 * (workspace menu, navigation, getting started, account; a 44 px icon rail when collapsed, D97)
 * and the page in a panel 6 px in from
 * every edge, the sidebar included, drawn exactly as Quality's content frame: 16 px corners, a
 * 0.5 px Border-on-bg stroke (`edge`) and no shadow (D72).
 */
export function AppShell({ children }: { children: ReactNode }) {
  // The links show at once; the workspace, brands and profile arrive together.
  const sidebar = (
    <ShellSidebar>
      <Suspense fallback={<SidebarSkeleton />}>
        <SidebarNav />
      </Suspense>
    </ShellSidebar>
  );
  return (
    <SidebarProvider>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-sm focus:bg-surface-primary focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <div className="flex h-dvh bg-dashboard text-body">
        {/* Collapsed, the column narrows to the 44 px icon rail (D97); its contents follow its
            width, labels fade, and the page panel widens with it. */}
        <aside
          aria-label="Sidebar"
          data-sidebar-desktop=""
          className="hidden w-sidebar shrink-0 overflow-hidden transition-rail lg:flex lg:sidebar-collapsed:w-rail"
        >
          {sidebar}
        </aside>
        <div className="flex min-w-0 flex-1 p-1.5">
          {/* relative: absolutely placed children (sr-only text in long tables) stay inside the
              panel's scroll; without it they're placed against the window and stretch it, and
              the whole shell scrolls away. */}
          <main
            id="main"
            className="relative min-w-0 flex-1 scrollbar-stable overflow-y-auto rounded-panel bg-surface-primary edge"
          >
            {children}
          </main>
        </div>
      </div>
      <MobileSidebar>{sidebar}</MobileSidebar>
      <RememberPath />
    </SidebarProvider>
  );
}
