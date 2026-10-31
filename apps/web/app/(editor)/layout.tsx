import type { ReactNode } from "react";

import { QueryProvider } from "@/components/app/query-provider";
import { Toaster } from "@/components/app/toaster";

/** Full-screen tools (the section editor): signed in, without the workspace shell, framed as
 * Create new page is (the `(focus)` layout): the page in the app's floating panel on the grey
 * canvas, 6 px in from every edge. The panel never scrolls; the editor scrolls its own parts.
 * React Query follows a clone's analysis there (B2.2). */
export default function EditorLayout({ children }: { children: ReactNode }) {
  return (
    <QueryProvider>
      <div className="flex h-dvh bg-dashboard p-1.5 text-body">
        <main
          id="main"
          className="relative flex min-w-0 flex-1 flex-col overflow-hidden rounded-panel bg-surface-primary edge"
        >
          {children}
        </main>
      </div>
      <Toaster />
    </QueryProvider>
  );
}
