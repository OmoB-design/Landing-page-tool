"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Keeps the gallery current while a clone is being analysed (B2.2): refreshes every 4 s. */
export function RefreshWhileAnalysing() {
  const router = useRouter();
  useEffect(() => {
    const timer = window.setInterval(() => router.refresh(), 4000);
    return () => window.clearInterval(timer);
  }, [router]);
  return null;
}
