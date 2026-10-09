import type { ReactNode } from "react";

import { Toaster } from "@/components/app/toaster";

/** Full-screen tools (the section editor): signed in, but without the workspace shell. */
export default function EditorLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <Toaster />
    </>
  );
}
