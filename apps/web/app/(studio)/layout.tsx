import type { ReactNode } from "react";

import { QueryProvider } from "@/components/app/query-provider";
import { Toaster } from "@/components/app/toaster";

/** The page editor (B3.1b, D105): signed in, without the workspace shell, on the grey canvas 6 px
 * in from every edge. Unlike `(editor)`, it draws no panel of its own: the editor lays out the page
 * panel and Lander's panel side by side, so Lander can squeeze the page. */
export default function StudioLayout({ children }: { children: ReactNode }) {
  return (
    <QueryProvider>
      <div className="flex h-dvh bg-dashboard p-1.5 text-body">
        <div id="main" className="flex min-w-0 flex-1">
          {children}
        </div>
      </div>
      <Toaster />
    </QueryProvider>
  );
}
