import type { ReactNode } from "react";

import { MobileSidebar } from "./mobile-sidebar";
import { SidebarNav } from "./sidebar";
import { SidebarProvider } from "./sidebar-state";

/**
 * The signed-in workspace (DESIGN.md §2, D67; Figma: Home): the 240 px sidebar on the grey canvas
 * (workspace menu, navigation, getting started, account) and the page in a panel 6 px in from
 * every edge, the sidebar included, drawn exactly as Quality's content frame: 16 px corners, a
 * 0.5 px Border-on-bg stroke (`edge`) and no shadow (D72).
 */
export function AppShell({ children }: { children: ReactNode }) {
  // The sidebar's own parts wait for the session; its links show at once.
  const sidebar = <SidebarNav />;
  return (
    <SidebarProvider>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-sm focus:bg-surface-primary focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <div className="flex h-dvh bg-dashboard text-body">
        <aside
          aria-label="Sidebar"
          className="hidden w-sidebar shrink-0 lg:flex lg:sidebar-collapsed:hidden"
        >
          {sidebar}
        </aside>
        <div className="flex min-w-0 flex-1 p-1.5">
          <main
            id="main"
            className="min-w-0 flex-1 scrollbar-stable overflow-y-auto rounded-panel bg-surface-primary edge"
          >
            {children}
          </main>
        </div>
      </div>
      <MobileSidebar>{sidebar}</MobileSidebar>
    </SidebarProvider>
  );
}
