import { type ReactNode, Suspense } from "react";

import { Skeleton } from "@/components/ui/shimmer-loader";

import { MobileSidebar } from "./mobile-sidebar";
import { SidebarNav } from "./sidebar";
import { SidebarProvider } from "./sidebar-state";

/**
 * The signed-in workspace (DESIGN.md §2, D67): one sidebar on the grey canvas (workspace menu,
 * jobs, notifications, navigation, settings, account) and the page in a floating white panel.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const sidebar = (
    <Suspense fallback={<SidebarSkeleton />}>
      <SidebarNav />
    </Suspense>
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
        <aside
          aria-label="Sidebar"
          className="hidden w-sidebar shrink-0 lg:flex lg:sidebar-collapsed:hidden"
        >
          {sidebar}
        </aside>
        <div className="flex min-w-0 flex-1 p-1.5 lg:pl-0 lg:sidebar-collapsed:pl-1.5">
          <main
            id="main"
            className="min-w-0 flex-1 overflow-y-auto rounded-lg border border-stroke bg-surface-primary shadow-panel"
          >
            {children}
          </main>
        </div>
      </div>
      <MobileSidebar>{sidebar}</MobileSidebar>
    </SidebarProvider>
  );
}

function SidebarSkeleton() {
  return (
    <div className="flex w-full flex-col gap-2 p-3">
      <Skeleton height="var(--spacing-nav-item)" radius="var(--radius-sm)" />
      <Skeleton
        height="calc(var(--spacing-nav-item) * 5)"
        radius="var(--radius-sm)"
      />
    </div>
  );
}
