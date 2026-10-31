"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { toast } from "@/components/app/toaster";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { startAnalysis } from "@/lib/templates/actions";

/** A clone's card → Analyse (B2.2): starts the analysis (one Claude call), then refreshes the
 * gallery, which shows it running. */
export function AnalyseButton({
  templateId,
  label,
}: {
  templateId: string;
  label: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="compact"
      className="flex-1"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await startAnalysis(templateId);
          if (result.jobId) {
            toast("Analysing the page. It takes about half a minute.");
            router.refresh();
          } else {
            toast.error(result.error ?? "Couldn’t start the analysis.");
          }
        })
      }
    >
      {pending ? <Spinner className="size-3.5" /> : null}
      {label}
    </Button>
  );
}
