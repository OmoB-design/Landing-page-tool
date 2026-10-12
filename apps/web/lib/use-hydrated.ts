"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * False during the server render and hydration, true after. For output that depends on client
 * data (React Query caches filled by another part of the page before this part hydrates), so the
 * first client render matches the server HTML.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
