import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * A settings page's column and title (D88; Quality's settings pages): 544 px wide (`wide`: 929 px,
 * Quality's Trash, for a table), 40 px under the header; a serif title with a one-line description
 * under it, then the page's sections 40 px apart.
 */
export function SettingsPage({
  title,
  description,
  wide = false,
  children,
}: {
  title: string;
  description: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "mx-auto box-content flex w-full flex-col gap-10 px-4 pt-10 pb-24 md:px-6",
        wide ? "max-w-settings-wide" : "max-w-settings",
      )}
    >
      <header className="flex flex-col gap-2">
        <h1 className="font-serif text-type-h4 font-medium text-heading-01">
          {title}
        </h1>
        <p className="text-type-body-small text-heading-05">{description}</p>
      </header>
      {children}
    </div>
  );
}

/** A full-width hairline between settings sections. */
export function SettingsDivider() {
  return <div aria-hidden className="h-px w-full shrink-0 bg-stroke" />;
}
