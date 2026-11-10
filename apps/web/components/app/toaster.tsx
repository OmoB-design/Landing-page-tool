"use client";

import { Toaster as SonnerToaster } from "sonner";

import { useThemePreference } from "./theme-preference";

/**
 * Toasts (sonner), following the app's light/dark preference. Bottom-right, quiet styling, laid
 * out one above the other rather than stacked behind each other (B7.1a): a job's progress toast
 * and the toast of the action that started it often show together, and both must stay readable
 * and clickable (a copy's Open sat under its preview check's toast).
 */
export function Toaster() {
  const theme = useThemePreference();
  return (
    <SonnerToaster
      theme={theme}
      position="bottom-right"
      expand
      toastOptions={{
        classNames: {
          toast:
            "edge-hairline bg-surface-primary text-body shadow-float rounded-md text-type-body-small",
          description: "text-sub-text text-type-caption-1",
        },
      }}
    />
  );
}

export { toast } from "sonner";
