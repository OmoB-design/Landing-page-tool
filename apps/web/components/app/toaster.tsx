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
            "border border-border bg-surface text-fg shadow-pop rounded-md text-base",
          description: "text-fg-muted text-sm",
        },
      }}
    />
  );
}

export { toast } from "sonner";
