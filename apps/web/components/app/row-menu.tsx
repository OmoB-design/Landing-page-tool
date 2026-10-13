"use client";

import Link from "next/link";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RowMoreIcon } from "@/components/ui/lp-icons";

const ITEM =
  "rounded-xsm px-1 py-0.5 text-type-caption-1 font-medium text-heading-02 focus:bg-foreground-03 focus:text-heading-02";

/**
 * The ⋯ at the end of a list row (Figma Brands Details: brand and product rows): an 18 px button
 * on Foreground-01 with 4 px corners, hidden until the row is hovered or focused (and always on
 * touch), opening a 132 px menu of links in the app's menu frame.
 */
export function RowMenu({
  label,
  items,
}: {
  /** e.g. "Actions for BREZ" */
  label: string;
  items: { label: string; href: string }[];
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className="flex size-4.5 shrink-0 items-center justify-center rounded-xsm bg-foreground-01 text-icon-nav-active opacity-0 outline-none group-hover/row:opacity-100 group-has-focus-visible/row:opacity-100 hover:bg-foreground-03 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring dark:bg-foreground-02 pointer-coarse:opacity-100 data-open:bg-foreground-03 data-open:opacity-100"
        >
          <RowMoreIcon />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={5}
        className="flex w-menu-row flex-col gap-0.5 rounded-sm bg-surface-modal p-0.5 shadow-float edge-hairline"
      >
        {items.map((item) => (
          <DropdownMenuItem key={item.href} asChild className={ITEM}>
            <Link href={item.href}>{item.label}</Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
