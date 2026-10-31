"use client";

import { type MouseEvent, useSyncExternalStore } from "react";

/**
 * The sidebar's current page moves the moment a link is clicked, not when the next page has
 * loaded (owner, 2026-10-31: the old row stayed filled beside the new one until then). A click
 * notes where it's going and where it was; while the address is still the old one, links treat
 * the destination as current. Once the address changes the note no longer applies.
 */
type Pending = { href: string; from: string };

let pending: Pending | null = null;
const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

/** The path links should treat as current: the clicked destination until the address changes. */
export function useNavPath(pathname: string | null): string | null {
  const note = useSyncExternalStore(
    subscribe,
    () => pending,
    () => null,
  );
  if (pathname === null) return null;
  return note && note.from === pathname ? note.href : pathname;
}

/** Notes a plain click on a link (not one opening a new tab or window). */
export function noteNavClick(
  event: MouseEvent,
  href: string,
  from: string | null,
) {
  if (from === null || event.defaultPrevented || event.button !== 0) return;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  pending = { href, from };
  for (const onChange of listeners) onChange();
}
