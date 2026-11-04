"use client";

import type { ComponentType, SVGProps } from "react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/** A square icon button with its name in a tooltip; when unavailable, the tooltip says why
 * (the section editors' move, duplicate and remove buttons). */
export function IconAction({
  icon: ActionIcon,
  label,
  unavailable,
  onClick,
}: {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
  unavailable: string | null;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          aria-disabled={unavailable ? true : undefined}
          onClick={unavailable ? undefined : onClick}
          className="bg-foreground-01 text-icon-system hover:bg-foreground-02 hover:text-body aria-disabled:cursor-not-allowed aria-disabled:opacity-40"
        >
          <ActionIcon aria-hidden />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{unavailable ?? label}</TooltipContent>
    </Tooltip>
  );
}
