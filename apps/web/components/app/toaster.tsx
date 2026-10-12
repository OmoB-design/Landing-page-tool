"use client";

import { Toaster as SonnerToaster } from "sonner";

import { useThemePreference } from "./theme-preference";

/** Toasts (sonner), following the app's light/dark preference. Bottom-right, quiet styling. */
export function Toaster() {
  const theme = useThemePreference();
  return (
    <SonnerToaster
      theme={theme}
      position="bottom-right"
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
