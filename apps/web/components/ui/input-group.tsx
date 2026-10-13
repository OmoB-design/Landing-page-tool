"use client";

import * as React from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDownFigmaIcon } from "@/components/ui/lp-icons";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

/*
 * The Input Field's other types (Figma 191:21125), built from one box:
 *   Leading Icon       <InputGroup><InputGroupIcon/><InputGroupInput/></InputGroup>
 *   Trailing Dropdown  <InputGroup><InputGroupIcon/><InputGroupInput/><InputGroupSelect side="end"/></InputGroup>
 *   Leading Dropdown   <InputGroup focus="field"><InputGroupSelect side="start"/><InputGroupInput/></InputGroup>
 *   Country            the same, with flags as the options' icons
 *   Toggle             <InputGroup><InputGroupInput/><InputGroupSwitch/></InputGroup>
 * States follow the input: empty shows Caption 1 (the placeholder, the leading icon and the
 * dropdown's value), filled or focused shows Heading-02/03, disabled greys the whole field.
 * Focus: the whole box turns Spot-500-Blue with the Focus halo, except where a dropdown leads
 * (focus="field"), where only the typing area gets the blue line, as in Figma.
 */

const BOX =
  "group/input-group relative flex h-10.5 w-full min-w-0 items-stretch rounded-lg border border-stroke bg-surface-primary text-type-caption-1 font-medium shadow-light transition-[border-color,box-shadow] duration-150 ease-out has-[input:disabled]:cursor-not-allowed has-[input:disabled]:border-stroke-strong has-[input:disabled]:bg-foreground-02 has-[input:disabled]:shadow-none has-[input[aria-invalid=true]]:border-text-danger";

/** The field's box. `focus="field"` keeps the box grey on focus and outlines the input only. */
function InputGroup({
  className,
  focus = "box",
  ...props
}: React.ComponentProps<"div"> & { focus?: "box" | "field" }) {
  return (
    <div
      data-slot="input-group"
      data-focus={focus}
      className={cn(
        BOX,
        focus === "box" &&
          "has-[input:focus]:border-spot-500-blue has-[input:focus]:shadow-focus",
        className,
      )}
      {...props}
    />
  );
}

/** The input inside a group: no box of its own; 14 px in, 8 px after an icon, 12 px after a dropdown. */
function InputGroupInput({
  className,
  ...props
}: React.ComponentProps<"input">) {
  return (
    <input
      data-slot="input-group-input"
      className={cn(
        "min-w-0 flex-1 bg-transparent px-3.5 text-heading-02 outline-none placeholder:text-caption-1 disabled:cursor-not-allowed disabled:text-text-disabled disabled:placeholder:text-text-disabled",
        "[[data-slot=input-group-icon]+&]:pl-2 [[data-slot=input-group-select]+&]:pl-3",
        // focus="field": the typing area carries its own 1 px line over the box's edges.
        "group-data-[focus=field]/input-group:-my-px group-data-[focus=field]/input-group:-mr-px group-data-[focus=field]/input-group:-ml-px group-data-[focus=field]/input-group:rounded-r-lg group-data-[focus=field]/input-group:border group-data-[focus=field]/input-group:border-transparent group-data-[focus=field]/input-group:focus:border-spot-500-blue",
        className,
      )}
      {...props}
    />
  );
}

/** A 14 px icon before the text (Leading Icon, Trailing Dropdown's currency sign). */
function InputGroupIcon({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="input-group-icon"
      aria-hidden
      className={cn(
        "flex shrink-0 items-center pl-3.5 text-icon-nav-active group-has-[input:disabled]/input-group:text-text-disabled group-has-[input:placeholder-shown]/input-group:text-caption-1 [&_svg]:size-3.5",
        className,
      )}
      {...props}
    />
  );
}

export type InputGroupOption = {
  value: string;
  label: string;
  /** e.g. a flag for Country */
  icon?: React.ReactNode;
};

/**
 * A dropdown inside the field (Leading Dropdown, Country, Trailing Dropdown): the value 14 px in
 * with the chevron 8 px from it (6 px around a flag). At the start it ends in a Surface/Stroke
 * line; at the end it sits on Shadow/Light. The value reads Caption 1 while the field is empty.
 */
function InputGroupSelect({
  side,
  label,
  value,
  options,
  onValueChange,
  disabled,
  className,
}: {
  side: "start" | "end";
  /** Names the dropdown for screen readers, e.g. "Country code" */
  label: string;
  value: string;
  options: InputGroupOption[];
  onValueChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const current = options.find((option) => option.value === value);
  const withIcon = Boolean(current?.icon);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <button
          type="button"
          data-slot="input-group-select"
          aria-label={`${label}: ${current?.label ?? value}`}
          className={cn(
            "flex shrink-0 items-center px-3.5 text-heading-03 outline-none group-has-[input:placeholder-shown]/input-group:text-caption-1 focus-visible:bg-foreground-01 disabled:cursor-not-allowed disabled:text-text-disabled [&_svg]:size-3.5",
            withIcon ? "gap-1.5" : "gap-2",
            side === "start"
              ? "rounded-l-lg border-r border-stroke group-has-[input:disabled]/input-group:border-stroke-strong"
              : "rounded-r-lg bg-surface-primary shadow-light group-has-[input:disabled]/input-group:bg-transparent group-has-[input:disabled]/input-group:shadow-none",
            className,
          )}
        >
          {side === "start" && !withIcon ? (
            <ChevronDownFigmaIcon className="text-icon-nav-active group-has-[input:disabled]/input-group:text-text-disabled" />
          ) : null}
          {current?.icon ? (
            <span className="flex size-3.5 items-center justify-center">
              {current.icon}
            </span>
          ) : null}
          <span>{current?.label ?? value}</span>
          {side === "end" || withIcon ? (
            <ChevronDownFigmaIcon className="text-icon-nav-active group-has-[input:disabled]/input-group:text-text-disabled" />
          ) : null}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={side === "start" ? "start" : "end"}
        sideOffset={6}
        className="flex max-h-72 min-w-32 flex-col gap-0.5 overflow-y-auto rounded-sm bg-surface-modal p-0.5 shadow-float edge-hairline"
      >
        <DropdownMenuRadioGroup value={value} onValueChange={onValueChange}>
          {options.map((option) => (
            <DropdownMenuRadioItem
              key={option.value}
              value={option.value}
              className="gap-1.5 rounded-xsm py-1 pr-7 pl-1 text-type-caption-1 font-medium text-heading-02 focus:bg-foreground-02 focus:text-heading-02"
            >
              {option.icon ? (
                <span aria-hidden className="flex size-3.5 items-center">
                  {option.icon}
                </span>
              ) : null}
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The toggle at the end of the field (Type=Toggle), 14 px from the edge. */
function InputGroupSwitch({
  className,
  ...props
}: React.ComponentProps<typeof Switch>) {
  return (
    <span className={cn("flex shrink-0 items-center pr-3.5", className)}>
      <Switch {...props} />
    </span>
  );
}

export {
  InputGroup,
  InputGroupIcon,
  InputGroupInput,
  InputGroupSelect,
  InputGroupSwitch,
};
