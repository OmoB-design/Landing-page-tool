import { readableOn } from "@/lib/brands/palette";
import { cn } from "@/lib/utils";

/**
 * A brand's mark in lists, the sidebar and headers: its emoji if set, otherwise its initial on
 * the brand colour (DESIGN.md §2). The colour is brand data, so it is an inline style.
 */
export function BrandMark({
  name,
  emoji,
  color,
  size = "sm",
}: {
  name: string;
  emoji?: string | null;
  color?: string | null;
  size?: "sm" | "md";
}) {
  const box = size === "md" ? "size-6 text-sm" : "size-4 text-xs";
  if (emoji) {
    return (
      <span
        aria-hidden
        className={cn("flex shrink-0 items-center justify-center", box)}
      >
        {emoji}
      </span>
    );
  }
  return (
    <span
      aria-hidden
      style={color ? { backgroundColor: color } : undefined}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-xs font-semibold",
        box,
        !color && "bg-surface-active",
        readableOn(color) === "light" ? "text-surface" : "text-fg",
      )}
    >
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}
