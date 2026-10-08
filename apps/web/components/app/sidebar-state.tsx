"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

import { Button } from "@/components/ui/button";
import { PanelCloseIcon, PanelOpenIcon } from "@/components/ui/icons";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { SIDEBAR_COOKIE } from "@/lib/preferences";

// Matches Tailwind's `lg` breakpoint: below it the sidebar is an overlay sheet.
const DESKTOP_QUERY = "(min-width: 1024px)";

type SidebarState = {
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
  /** Desktop: collapse or expand the sidebar column (remembered in a cookie). Mobile: open or close the sheet. */
  toggle: () => void;
};

const SidebarContext = createContext<SidebarState | null>(null);

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const toggle = useCallback(() => {
    if (!window.matchMedia(DESKTOP_QUERY).matches) {
      setMobileOpen((open) => !open);
      return;
    }
    // The collapsed state lives on <html> (set before paint from the cookie), so CSS alone
    // shows or hides the column and there is no hydration flash.
    const root = document.documentElement;
    const collapse = root.getAttribute("data-sidebar") !== "collapsed";
    if (collapse) root.setAttribute("data-sidebar", "collapsed");
    else root.removeAttribute("data-sidebar");
    document.cookie = `${SIDEBAR_COOKIE}=${collapse ? "collapsed" : "open"}; path=/; max-age=31536000; samesite=lax`;
  }, []);

  const value = useMemo(
    () => ({ mobileOpen, setMobileOpen, toggle }),
    [mobileOpen, toggle],
  );
  return <SidebarContext value={value}>{children}</SidebarContext>;
}

export function useSidebar(): SidebarState {
  const context = useContext(SidebarContext);
  if (!context)
    throw new Error("useSidebar must be used inside <SidebarProvider>.");
  return context;
}

/** Icon button that collapses (in the sidebar header) or opens (in the top bar) the sidebar. */
export function SidebarToggleButton({
  action,
  className,
}: {
  action: "open" | "close";
  className?: string;
}) {
  const { toggle } = useSidebar();
  const label = action === "open" ? "Open sidebar" : "Collapse sidebar";
  const Icon = action === "open" ? PanelOpenIcon : PanelCloseIcon;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          onClick={toggle}
          className={className}
        >
          <Icon aria-hidden />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
