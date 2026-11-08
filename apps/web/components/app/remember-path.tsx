"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";

/** Where a full-screen task goes back to when it's closed (this tab's last workspace page). */
export const RETURN_TO_KEY = "lp-return-to";

/** Where Settings' Back to app goes (this tab's last page outside Settings, B6.5). */
export const APP_PAGE_KEY = "lp-app-page";

/** Back to app's address: the last page outside Settings in this tab, or Home. Only this app's own
 * paths are trusted (a value someone planted that leaves the site is ignored). */
export function lastAppPage(): string {
  try {
    const path = sessionStorage.getItem(APP_PAGE_KEY);
    if (path && path.startsWith("/") && !path.startsWith("//")) return path;
  } catch {
    // Storage blocked: Home.
  }
  return "/home";
}

function Recorder() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  useEffect(() => {
    const path = search ? `${pathname}?${search}` : pathname;
    try {
      sessionStorage.setItem(RETURN_TO_KEY, path);
      // Settings' own pages aren't somewhere to go back to from Settings.
      if (pathname !== "/settings" && !pathname.startsWith("/settings/")) {
        sessionStorage.setItem(APP_PAGE_KEY, path);
      }
    } catch {
      // Storage blocked: closing a task falls back to Pages, Back to app to Home.
    }
  }, [pathname, search]);
  return null;
}

/** Remembers the current workspace page, so Create new page can return to it, and the last one
 * outside Settings, so Settings' Back to app can (B6.5). */
export function RememberPath() {
  return (
    <Suspense fallback={null}>
      <Recorder />
    </Suspense>
  );
}
