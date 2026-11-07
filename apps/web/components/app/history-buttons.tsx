"use client";

import type { ReactNode } from "react";

import { RedoIcon, UndoIcon } from "@/components/ui/icons";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

function HistoryButton({
  label,
  shortcut,
  keys,
  disabled,
  onClick,
  className,
  children,
}: {
  label: string;
  shortcut: string;
  keys: string;
  disabled: boolean;
  onClick: () => void;
  className: string;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          aria-disabled={disabled || undefined}
          aria-keyshortcuts={keys}
          onClick={disabled ? undefined : onClick}
          className={cn(
            "flex w-8 items-center justify-center bg-foreground-01 text-icon-strong transition-colors duration-150 ease-out outline-none hover:bg-foreground-02 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset active:bg-foreground-03 aria-disabled:cursor-not-allowed aria-disabled:text-icon-off aria-disabled:hover:bg-foreground-01 aria-disabled:active:bg-foreground-01",
            className,
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent>
        {label} <kbd className="font-sans text-caption-1">{shortcut}</kbd>
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Undo and Redo as Shopify's theme editor draws them (owner, 2026-11-06; measured from the owner's
 * recording): one 28 px pill split into two 32 px icon halves on Foreground 01, a 1 px gap of the
 * bar between them, the icons in Icon-Strong, or Icon-Off when there's nothing to undo or redo
 * (Shopify's two greys). Icons only; the label and shortcut are in the tooltip.
 */
export function HistoryButtons({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}) {
  return (
    <div role="group" aria-label="History" className="flex h-7 gap-px">
      <HistoryButton
        label="Undo"
        shortcut="⌘Z"
        keys="Meta+Z"
        disabled={!canUndo}
        onClick={onUndo}
        className="rounded-l-full pl-0.5"
      >
        <UndoIcon aria-hidden className="size-4" strokeWidth={2.25} />
      </HistoryButton>
      <HistoryButton
        label="Redo"
        shortcut="⇧⌘Z"
        keys="Meta+Shift+Z"
        disabled={!canRedo}
        onClick={onRedo}
        className="rounded-r-full pr-0.5"
      >
        <RedoIcon aria-hidden className="size-4" strokeWidth={2.25} />
      </HistoryButton>
    </div>
  );
}
