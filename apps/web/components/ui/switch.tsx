"use client";

import * as React from "react";
import { Switch as SwitchPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

/**
 * The toggle (Figma: Switch, in Input Field Type=Toggle): a 34 x 19 pill with a 15 px knob 2 px
 * in (a 1 px border and 1 px of padding). Off: the Icon-Explainer grey with a Surface/Stroke
 * edge (the frame's Overlay grey has no twin here; ours is near-black). On: Spot-500-Blue (Blue
 * 500), the knob 15 px across with a 0.5 px Foreground-01 line.
 */
function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer inline-flex h-4.75 w-8.5 shrink-0 cursor-pointer items-center rounded-full border border-stroke bg-icon-explainer p-px transition-colors duration-150 ease-out outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-transparent data-[state=checked]:bg-spot-500-blue",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block size-3.75 rounded-full bg-surface-primary transition-transform duration-150 ease-out data-[state=checked]:translate-x-3.75 data-[state=checked]:ring-[0.5px] data-[state=checked]:ring-foreground-01 data-[state=unchecked]:translate-x-0"
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
