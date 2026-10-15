"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";

/** Where a full-screen task goes back to when it's closed (this tab's last workspace page). */
export const RETURN_TO_KEY = "lp-return-to";

function Recorder() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  useEffect(() => {
    try {
      sessionStorage.setItem(
        RETURN_TO_KEY,
        search ? `${pathname}?${search}` : pathname,
      );
    } catch {
      // Storage blocked: closing a task falls back to Pages.
    }
  }, [pathname, search]);
  return null;
}

/** Remembers the current workspace page, so Create new page can return to it. */
export function RememberPath() {
  return (
    <Suspense fallback={null}>
      <Recorder />
    </Suspense>
  );
}
