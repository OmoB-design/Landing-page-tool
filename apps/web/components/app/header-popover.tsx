"use client";

import { type ReactNode, useLayoutEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

// The Jobs and Notification popovers in the page header (Figma: Notis, Default and Hover).

/**
 * 280 px on Surface-Modal, 10 px corners, a true 0.5 px edge hairline and the soft float shadow. The
 * list sits 12 px under the title and runs straight into the footer (pad lists with py-3), so the
 * fade meets the footer as in Figma.
 */
export const HEADER_POPOVER =
  "flex w-menu-header flex-col overflow-hidden rounded-lg bg-surface-modal p-0 shadow-float edge-hairline";

/** "Notification" / "Jobs": 11 px heading-05, 12 px in, over a 0.7 px divider. */
export const HEADER_POPOVER_TITLE =
  "divider-b-thin p-3 text-type-caption-2 font-medium text-heading-05";

/**
 * The footer under the list: Surface-Primary with a 0.5 px top stroke, lifted by a soft shadow
 * on hover; its action keeps the label 12 px in and 8 px down (pad it with POPOVER_FOOTER_ACTION).
 */
export const POPOVER_FOOTER =
  "relative flex bg-surface-primary pt-1 pr-1 pb-2 pl-1.5 divider-t-half hover:shadow-lift";

/** "Mark all as read": 12 px medium heading-01; a Foreground-01 pill with 6 px corners on hover. */
export const POPOVER_FOOTER_ACTION =
  "rounded-sm px-1.5 py-1 text-type-caption-1 font-medium text-heading-01 outline-none hover:bg-foreground-01 focus-visible:bg-foreground-01 disabled:cursor-default disabled:text-heading-05 disabled:hover:bg-transparent";

/**
 * The popover's list, up to 384 px tall. While more of it sits below, its last 40 px fade out into
 * the footer (the `scroll-fade-b` utility: a mask driven by the list's own scroll). `data-more`
 * carries the same state from script for browsers without scroll-driven animations.
 */
export function PopoverScroll({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () =>
      setMore(
        element.scrollHeight - element.scrollTop - element.clientHeight > 1,
      );
    update();
    element.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(element);
    if (element.firstElementChild) observer.observe(element.firstElementChild);
    return () => {
      element.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, []);

  return (
    <div
      ref={ref}
      data-more={more ? "" : undefined}
      className={cn(
        "max-h-96 min-h-0 scroll-fade-b overflow-y-auto",
        className,
      )}
    >
      {children}
    </div>
  );
}
