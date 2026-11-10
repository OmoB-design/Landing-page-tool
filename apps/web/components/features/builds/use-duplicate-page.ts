"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { toast } from "@/components/app/toaster";
import { apiFetch } from "@/lib/api/client";
import { type BuildSummary, buildSummarySchema } from "@/lib/validators/build";

/**
 * Duplicate (B7.1, D144), from a page row's ⋯ and the build page's: a copy of the page as it is
 * now, made at once and for nothing. The toast names it and offers Open; the list it sits in is
 * read again (`onCopied` for one kept by React Query, as the batch screen's).
 */
export function useDuplicatePage(
  buildId: string,
  onCopied?: (copy: BuildSummary) => void,
) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const start = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const copy = await apiFetch(
        `/api/builds/${buildId}/duplicate`,
        buildSummarySchema,
        { method: "POST" },
      );
      toast.success(`${copy.key} made`, {
        description: copy.title,
        action: {
          label: "Open",
          onClick: () => router.push(`/pages/${copy.id}`),
        },
      });
      router.refresh();
      onCopied?.(copy);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Couldn’t duplicate the page.",
      );
    } finally {
      setBusy(false);
    }
  };
  return { busy, start: () => void start() };
}
