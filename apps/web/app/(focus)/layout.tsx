import type { ReactNode } from "react";

import { QueryProvider } from "@/components/app/query-provider";
import { Toaster } from "@/components/app/toaster";

/**
 * Full-screen tasks (Create new page): signed in, the page in the app's floating panel on the grey
 * canvas, 6 px in from every edge, without the sidebar. The page brings its own header with a way
 * out.
 */
export default function FocusLayout({ children }: { children: ReactNode }) {
  return (
    <QueryProvider>
      <div className="flex h-dvh bg-dashboard p-1.5 text-body">
        <main
          id="main"
          // relative: absolutely placed text (screen-reader labels) stays inside the panel's
          // scroll instead of stretching the page below it.
          className="relative min-w-0 flex-1 scrollbar-stable overflow-y-auto rounded-panel bg-surface-primary edge"
        >
          {children}
        </main>
      </div>
      <Toaster />
    </QueryProvider>
  );
}
