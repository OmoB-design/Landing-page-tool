"use client";

import { toast } from "@/components/app/toaster";
import { BuildPreview } from "@/components/features/builds/build-preview";

/** /dev/build-states: shows the toast Export raises when an export fails. */
export function ExportErrorToastButton() {
  return (
    <button
      type="button"
      onClick={() =>
        toast.error(
          "Couldn’t export the page: an image couldn’t be downloaded.",
        )
      }
      className="rounded-sm px-2 py-1 text-type-caption-1 font-medium text-text-link outline-none hover:bg-foreground-01 focus-visible:ring-2 focus-visible:ring-ring"
    >
      Show the error toast
    </button>
  );
}

/** /dev/build-states: the preview of a build that failed on "Swap in the logo"; Retry does nothing here. */
export function SampleFailedPreview() {
  return (
    <BuildPreview
      buildId="sample"
      version="1"
      ready={false}
      failed
      failedStep="Swap in the logo"
      onRetry={() => toast("Retry would queue the build again.")}
    />
  );
}
