"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/** Re-renders the page's server components once when a job finishes (e.g. to show its result). */
export function usePageRefresh(finishedJobId: string | null) {
  const router = useRouter();
  const refreshed = useRef<string | null>(null);
  useEffect(() => {
    if (finishedJobId && refreshed.current !== finishedJobId) {
      refreshed.current = finishedJobId;
      router.refresh();
    }
  }, [finishedJobId, router]);
}
