import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { Slot } from "radix-ui";

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-sm border border-transparent bg-clip-padding text-type-body-small font-medium whitespace-nowrap transition-[color,background-color,border-color,box-shadow,transform] duration-150 ease-out outline-none select-none motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-ring/40 active:not-aria-[haspopup]:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // The blue button (Figma: Button Primary States; the button-primary utility in globals.css).
        default: "button-primary text-button-primary-text",
        // The published modal's buttons (Figma 631:14872): a 0.5 px Stroke-Strong edge and a light
        // shadow, with no raised fill in dark (owner, 2026-10-28). The edge is a ring, not a
        // border: Chrome draws a 0.5 px border a whole pixel wide.
        outline:
          "border-0 bg-surface-primary text-body shadow-light ring-half ring-stroke-strong hover:bg-foreground-02 aria-expanded:bg-foreground-02",
        secondary:
          "bg-foreground-02 text-body hover:bg-foreground-03 aria-expanded:bg-foreground-03",
        ghost:
          "hover:bg-foreground-02 hover:text-body aria-expanded:bg-foreground-02 aria-expanded:text-body",
        destructive:
          "bg-button-danger text-button-danger-text shadow-edge hover:bg-button-danger-active focus-visible:ring-spot-500-red/30",
        // Quality's quieter red button (Trash's Permanently delete, D92): red text on a pale red
        // fill; in dark, pale text on a deep red.
        "destructive-secondary":
          "bg-highlight-red-50 text-text-danger hover:opacity-80 focus-visible:ring-spot-500-red/30",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-6 gap-1 rounded-xsm px-2 text-type-caption-2 in-data-[slot=button-group]:rounded-sm has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-sm px-2.5 text-type-body-small in-data-[slot=button-group]:rounded-sm has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        // Figma Button Primary States: 26 px, 8 px corners, 4/8 padding, 6 px gap, 12 px medium label, 14 px icon.
        compact:
          "h-6.5 gap-1.5 rounded-md px-2 text-type-caption-1 [&_svg:not([class*='size-'])]:size-3.5",
        icon: "size-8",
        "icon-xs":
          "size-6 rounded-xsm in-data-[slot=button-group]:rounded-sm [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-7 rounded-sm in-data-[slot=button-group]:rounded-sm",
        "icon-lg": "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
