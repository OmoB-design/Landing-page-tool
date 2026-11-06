"use client";

import { Button } from "@/components/ui/button";
import { MonitorIcon, PhoneIcon } from "@/components/ui/icons";

export type Viewport = "desktop" | "phone";

/** Desktop / Phone (as the template editor's preview, Figma 739:16891), in the page editor's top bar and on the
 * client's review page (B3.6). */
export function ViewportSwitch({
  value,
  onChange,
}: {
  value: Viewport;
  onChange: (viewport: Viewport) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Page width"
      className="flex items-center rounded-md bg-foreground-03 p-0.5 ring-hair ring-stroke ring-inset dark:bg-foreground-01 dark:ring-0"
    >
      {(
        [
          ["desktop", "Desktop", MonitorIcon],
          ["phone", "Phone", PhoneIcon],
        ] as const
      ).map(([id, label, ViewIcon]) => (
        <Button
          key={id}
          variant="ghost"
          size="sm"
          aria-pressed={value === id}
          onClick={() => onChange(id)}
          className="group/view h-6.5 gap-1 rounded-sm px-1.5 text-type-caption-1 font-medium text-heading-02 hover:bg-transparent hover:text-body aria-pressed:bg-surface-primary dark:text-sub-text dark:aria-pressed:bg-letter-paper dark:aria-pressed:text-body dark:aria-pressed:shadow-sm"
        >
          <ViewIcon
            aria-hidden
            className="size-3.5 text-icon-system group-aria-pressed/view:text-stroke-input-active"
          />
          <span className="sr-only xl:not-sr-only">{label}</span>
        </Button>
      ))}
    </div>
  );
}
