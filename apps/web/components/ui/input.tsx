import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * The text field (Figma: Input Field, Type=Default). 46 px: 14 px in on a 12 px medium line,
 * 10 px corners, a 1 px Surface/Stroke border and Shadow/Light. Empty, it shows the placeholder
 * in Caption 1; filled, the text is Heading-02. Focused: a Spot-500-Blue border with the Focus
 * halo. Disabled: Foreground-02 on Stroke-Strong, text in Grey 400. For icons, dropdowns or a
 * toggle inside the field, use InputGroup (input-group.tsx).
 */
export const INPUT_FIELD =
  "h-11.5 w-full min-w-0 rounded-lg border border-stroke bg-surface-primary px-3.5 text-type-caption-1 font-medium text-heading-02 shadow-light transition-[border-color,box-shadow] duration-150 ease-out outline-none placeholder:text-caption-1 focus:border-spot-500-blue focus:shadow-focus disabled:cursor-not-allowed disabled:border-stroke-strong disabled:bg-foreground-02 disabled:text-text-disabled disabled:shadow-none disabled:placeholder:text-text-disabled aria-invalid:border-text-danger file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-type-caption-1 file:font-medium";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(INPUT_FIELD, className)}
      {...props}
    />
  );
}

export { Input };
