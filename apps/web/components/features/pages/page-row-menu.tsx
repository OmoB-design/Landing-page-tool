"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreIcon } from "@/components/ui/icons";

/** The ⋯ menu at the end of a page row; visible on row hover, keyboard focus or touch. */
export function PageRowMenu({
  pageKey,
  href,
}: {
  pageKey: string;
  href: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Actions for ${pageKey}`}
          className="text-sub-text opacity-0 group-hover/row:opacity-100 hover:bg-foreground-03 focus-visible:opacity-100 pointer-coarse:opacity-100 data-open:opacity-100"
        >
          <MoreIcon aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem asChild>
          <Link href={href}>Open</Link>
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => void navigator.clipboard?.writeText(pageKey)}
        >
          Copy key
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
