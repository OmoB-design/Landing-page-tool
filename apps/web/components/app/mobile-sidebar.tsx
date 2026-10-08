"use client";

import type { ReactNode } from "react";

import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

import { useSidebar } from "./sidebar-state";

/** Below 1024 px the sidebar is an overlay sheet, opened from the top bar. */
export function MobileSidebar({ children }: { children: ReactNode }) {
  const { mobileOpen, setMobileOpen } = useSidebar();

  return (
    <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
      <SheetContent
        side="left"
        showCloseButton={false}
        aria-describedby={undefined}
        className="overflow-y-auto bg-surface p-0 lg:hidden"
      >
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        {/* Close the sheet when a link inside it is followed. */}
        <div
          onClickCapture={(event) => {
            if (event.target instanceof Element && event.target.closest("a"))
              setMobileOpen(false);
          }}
        >
          {children}
        </div>
      </SheetContent>
    </Sheet>
  );
}
