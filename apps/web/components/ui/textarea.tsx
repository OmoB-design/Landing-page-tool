import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * A multi-line field in the Input Field's look (Figma 191:21125): 14 px in, 12 px medium on a
 * 150 % line, 10 px corners, a 1 px Surface/Stroke border with Shadow/Light; Spot-500-Blue with
 * the Focus halo when focused; Foreground-02 on Stroke-Strong when disabled. Grows with its text.
 */
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-16 w-full rounded-lg border border-stroke bg-surface-primary px-3.5 py-3 text-type-caption-1 font-medium text-heading-02 shadow-light transition-[border-color,box-shadow] duration-150 ease-out outline-none placeholder:text-caption-1 focus:border-spot-500-blue focus:shadow-focus disabled:cursor-not-allowed disabled:border-stroke-strong disabled:bg-foreground-02 disabled:text-text-disabled disabled:shadow-none aria-invalid:border-text-danger",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
