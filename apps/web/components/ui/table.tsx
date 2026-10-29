import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/**
 * A table as Quality draws them (Trash, D92): a 16 px rounded card with the frame's edge, a 32 px
 * header row of 13 px medium Heading-05 labels, 40 px rows between Stroke lines (none under the
 * last), 12 px in at each side, 13 px text. Columns are fixed-width (`table-fixed`); give header
 * cells widths. Scrolls sideways inside the card when the column is narrow.
 */
export function Table({
  className,
  containerClassName,
  ...props
}: ComponentProps<"table"> & { containerClassName?: string }) {
  return (
    <div
      data-slot="table-container"
      className={cn(
        "overflow-hidden rounded-panel bg-surface-primary edge",
        containerClassName,
      )}
    >
      <div className="overflow-x-auto">
        <table
          data-slot="table"
          className={cn("w-full table-fixed text-left", className)}
          {...props}
        />
      </div>
    </div>
  );
}

export function TableCaption({
  className,
  ...props
}: ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("text-type-body-small text-heading-05", className)}
      {...props}
    />
  );
}

export function TableHeader({ className, ...props }: ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("[&_tr]:h-8", className)}
      {...props}
    />
  );
}

export function TableBody({ className, ...props }: ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-b-0", className)}
      {...props}
    />
  );
}

export function TableRow({ className, ...props }: ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn("h-10 border-b border-stroke", className)}
      {...props}
    />
  );
}

export function TableHead({ className, ...props }: ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "px-3 text-type-body-small font-medium text-heading-05",
        className,
      )}
      {...props}
    />
  );
}

export function TableCell({ className, ...props }: ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn("px-3 text-type-body-small text-heading-01", className)}
      {...props}
    />
  );
}
