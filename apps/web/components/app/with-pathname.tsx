"use client";

import { usePathname } from "next/navigation";
import { type ReactNode, Suspense } from "react";

type Render = (pathname: string) => ReactNode;

function PathnameReader({ children }: { children: Render }) {
  return children(usePathname());
}

/**
 * Renders `children(pathname)` for active-link state. On routes with dynamic params
 * (/pages/[buildId], /brands/[brandId]) the pathname is only known at request time, so the read
 * sits in its own Suspense boundary: `fallback` (the same UI with nothing active) goes into the
 * static shell and the active state streams in. On static routes it resolves at prerender and
 * the fallback is never shown.
 */
export function WithPathname({
  fallback,
  children,
}: {
  fallback: ReactNode;
  children: Render;
}) {
  return (
    <Suspense fallback={fallback}>
      <PathnameReader>{children}</PathnameReader>
    </Suspense>
  );
}
