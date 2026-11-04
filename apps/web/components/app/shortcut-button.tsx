"use client";

import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/** A top-bar button with its keyboard shortcut in the tooltip (the editors' Undo and Redo). */
export function ShortcutButton({
  label,
  shortcut,
  disabled,
  onClick,
  children,
}: {
  label: string;
  shortcut: string;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-disabled={disabled || undefined}
          aria-keyshortcuts={shortcut === "⌘Z" ? "Meta+Z" : "Meta+Shift+Z"}
          onClick={disabled ? undefined : onClick}
          className="text-sub-text aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
        >
          {children}
          <span className="sr-only sm:not-sr-only">{label}</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {label} <kbd className="font-sans text-caption-1">{shortcut}</kbd>
      </TooltipContent>
    </Tooltip>
  );
}
