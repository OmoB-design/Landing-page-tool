"use client";

import { useId, useRef } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDownFigmaIcon } from "@/components/ui/lp-icons";
import { cn } from "@/lib/utils";

export type SelectFieldOption = { value: string; label: string };

/**
 * A dropdown in the Input Field's look (Figma: Input Field, Type=Trailing Dropdown): the label in
 * 13 px medium Heading-03, 6 px above a 42 px box (10 px corners, 1 px Surface/Stroke, Shadow/Light)
 * with the value 14 px in, Caption 1 until one is chosen, and the chevron at the end of its 70 px
 * end, which fills the field's height. It opens the workspace menu's list (the top of the sidebar): Surface-Primary, 2 px in,
 * 6 px corners, Shadow/Float, 4 px-padded items with a 14 px tick on the chosen one. While open,
 * the box turns Spot-500-Blue with the Focus halo, as a focused field does.
 */
export function SelectField({
  label,
  value,
  placeholder,
  options,
  onValueChange,
  disabled = false,
  className,
  labelClassName,
}: {
  label: string;
  value: string | null;
  placeholder: string;
  options: SelectFieldOption[];
  onValueChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  /** Matches the label to a form's other fields, e.g. FieldLabel's 14 px. */
  labelClassName?: string;
}) {
  const id = useId();
  const current = options.find((option) => option.value === value);
  // Opened with the pointer: focus isn't handed back to the box on close, so a pick doesn't leave
  // it outlined in blue. From the keyboard it is, so you keep your place.
  const byPointer = useRef(false);
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <span
        id={`${id}-label`}
        className={cn(
          "text-type-body-small font-medium text-heading-03",
          labelClassName,
        )}
      >
        {label}
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild disabled={disabled}>
          <button
            type="button"
            onPointerDown={() => {
              byPointer.current = true;
            }}
            onKeyDown={() => {
              byPointer.current = false;
            }}
            aria-labelledby={`${id}-label ${id}-value`}
            className="group flex h-10.5 w-full min-w-0 items-stretch rounded-lg border border-stroke bg-surface-primary text-left text-type-caption-1 font-medium shadow-light transition duration-150 ease-out outline-none hover:border-stroke-strong focus-visible:border-spot-500-blue focus-visible:shadow-focus disabled:cursor-not-allowed disabled:border-stroke-strong disabled:bg-foreground-02 disabled:shadow-none aria-expanded:border-spot-500-blue aria-expanded:shadow-focus"
          >
            <span
              id={`${id}-value`}
              className={cn(
                "flex min-w-0 flex-1 items-center truncate px-3.5",
                current ? "text-heading-02" : "text-caption-1",
                "group-disabled:text-text-disabled",
              )}
            >
              <span className="truncate">{current?.label ?? placeholder}</span>
            </span>
            <span className="flex w-17.5 shrink-0 items-center justify-end rounded-r-lg bg-surface-primary px-3.5 shadow-light group-disabled:bg-transparent group-disabled:shadow-none">
              <ChevronDownFigmaIcon className="size-3.5 text-icon-explainer transition-transform duration-150 ease-out group-aria-expanded:rotate-180 motion-reduce:transition-none" />
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          sideOffset={6}
          onCloseAutoFocus={(event) => {
            if (byPointer.current) event.preventDefault();
            byPointer.current = false;
          }}
          className="flex max-h-72 flex-col gap-0.5 rounded-sm bg-surface-primary p-0.5 text-heading-02 shadow-float edge-hairline"
        >
          <DropdownMenuRadioGroup
            value={value ?? ""}
            onValueChange={onValueChange}
          >
            {options.map((option) => (
              <DropdownMenuRadioItem
                key={option.value}
                value={option.value}
                checkClassName="size-3.5 text-icon-system"
                className="gap-1 rounded-xsm p-1 pr-6 text-type-caption-1 font-medium text-heading-02 focus:bg-foreground-02 focus:text-heading-02"
              >
                <span className="truncate">{option.label}</span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
