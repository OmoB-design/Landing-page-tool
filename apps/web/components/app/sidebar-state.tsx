"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";

import { SidebarCollapseIcon } from "@/components/ui/lp-icons";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { SIDEBAR_COOKIE } from "@/lib/preferences";
import { cn } from "@/lib/utils";

// Matches Tailwind's `lg` breakpoint: below it the sidebar is an overlay sheet.
const DESKTOP_QUERY = "(min-width: 1024px)";

type SidebarState = {
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
  /** Desktop: collapse or expand the sidebar column (remembered in a cookie). Mobile: open or close the sheet. */
  toggle: () => void;
  /** Whether the desktop column is the icon rail now (D97); false before hydration. */
  rail: boolean;
};

// The rail state lives on <html> (see toggle), so components read it from there.
function subscribeRail(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-sidebar"],
  });
  const desktop = window.matchMedia(DESKTOP_QUERY);
  desktop.addEventListener("change", onChange);
  return () => {
    observer.disconnect();
    desktop.removeEventListener("change", onChange);
  };
}

function readRail() {
  return (
    document.documentElement.getAttribute("data-sidebar") === "collapsed" &&
    window.matchMedia(DESKTOP_QUERY).matches
  );
}

const SidebarContext = createContext<SidebarState | null>(null);

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const rail = useSyncExternalStore(subscribeRail, readRail, () => false);

  const toggle = useCallback(() => {
    if (!window.matchMedia(DESKTOP_QUERY).matches) {
      setMobileOpen((open) => !open);
      return;
    }
    // The collapsed state lives on <html> (set before paint from the cookie), so CSS alone
    // narrows the column to its rail and there is no hydration flash.
    const root = document.documentElement;
    const collapse = root.getAttribute("data-sidebar") !== "collapsed";
    if (collapse) root.setAttribute("data-sidebar", "collapsed");
    else root.removeAttribute("data-sidebar");
    document.cookie = `${SIDEBAR_COOKIE}=${collapse ? "collapsed" : "open"}; path=/; max-age=31536000; samesite=lax`;
  }, []);

  const value = useMemo(
    () => ({ mobileOpen, setMobileOpen, toggle, rail }),
    [mobileOpen, toggle, rail],
  );
  return <SidebarContext value={value}>{children}</SidebarContext>;
}

/** Whether this renders inside the app shell (component tests render pieces without it). */
export function useInShell(): boolean {
  return useContext(SidebarContext) !== null;
}

/** Whether the desktop sidebar is the icon rail now (false outside the app shell). */
export function useRail(): boolean {
  return useContext(SidebarContext)?.rail ?? false;
}

export function useSidebar(): SidebarState {
  const context = useContext(SidebarContext);
  if (!context)
    throw new Error("useSidebar must be used inside <SidebarProvider>.");
  return context;
}

/** The sidebar's collapse button (Figma: Icon/Sidebar Left — a 32 px box around a 14 px icon);
 * the same icon opens the sidebar from a page header (Figma Build, full screen). Renders nothing outside the app shell
 * (e.g. a page header in a component test). */
export function SidebarToggleButton({
  action,
  className,
}: {
  action: "open" | "close";
  className?: string;
}) {
  const context = useContext(SidebarContext);
  if (!context) return null;
  const { toggle } = context;
  const label = action === "open" ? "Open sidebar" : "Collapse sidebar";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          onClick={toggle}
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-sm text-icon-system outline-none hover:bg-foreground-02 hover:text-icon-nav-active focus-visible:ring-2 focus-visible:ring-ring",
            className,
          )}
        >
          <SidebarCollapseIcon className="size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
