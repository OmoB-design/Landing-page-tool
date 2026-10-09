import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * A selectable card built on a real radio or checkbox input (so arrow keys, Space and screen
 * readers work as usual): the whole card is the label; checked cards get the accent border.
 */
export function OptionCard({
  type,
  name,
  value,
  checked,
  disabled = false,
  onChange,
  className,
  children,
}: {
  type: "radio" | "checkbox";
  name: string;
  value: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label
      className={cn(
        "relative flex cursor-pointer flex-col overflow-hidden rounded-lg border border-border bg-surface text-left hover:border-border-strong has-checked:border-accent has-checked:ring-1 has-checked:ring-accent has-focus-visible:ring-2 has-focus-visible:ring-ring has-disabled:cursor-not-allowed has-disabled:opacity-50",
        className,
      )}
    >
      <input
        type={type}
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="sr-only"
      />
      {children}
    </label>
  );
}
