import { type ReactNode, Suspense } from "react";

import { IconRail } from "./icon-rail";
import { MobileSidebar } from "./mobile-sidebar";
import { SidebarNav } from "./sidebar";
import { SidebarProvider } from "./sidebar-state";
import { TopBar } from "./top-bar";

/**
 * The signed-in workspace (DESIGN.md §2): top bar over an icon rail, a collapsible sidebar and
 * the main pane. Rail and top bar sit on the canvas; sidebar and main share one white panel.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-sm focus:bg-surface focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <div className="flex h-dvh flex-col bg-canvas text-fg">
        <Suspense fallback={<div className="h-topbar shrink-0" />}>
          <TopBar />
        </Suspense>
        <div className="flex min-h-0 flex-1">
          <IconRail />
          <div className="flex min-w-0 flex-1 overflow-hidden rounded-tl-lg border-t border-l border-border bg-surface">
            <aside
              aria-label="Sidebar"
              className="hidden w-sidebar shrink-0 overflow-y-auto border-r border-border lg:block lg:sidebar-collapsed:hidden"
            >
              <SidebarNav />
            </aside>
            <main id="main" className="min-w-0 flex-1 overflow-y-auto">
              {children}
            </main>
          </div>
        </div>
      </div>
      <MobileSidebar>
        <SidebarNav />
      </MobileSidebar>
    </SidebarProvider>
  );
}
