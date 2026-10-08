import type { ReactNode } from "react";

import { AppShell } from "@/components/app/app-shell";
import { QueryProvider } from "@/components/app/query-provider";
import { Toaster } from "@/components/app/toaster";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <QueryProvider>
      <AppShell>{children}</AppShell>
      <Toaster />
    </QueryProvider>
  );
}
