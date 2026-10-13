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
  /** sm 16 px, md 24 px; Figma Brands Details: crumb 18 px (page header), list 20 px (brand
   * rows), row 24 px (product rows), all with medium letters. */
  size?: "sm" | "md" | "crumb" | "list" | "row";
}) {
  const box = {
    sm: "size-4 text-type-caption-2 font-semibold",
    md: "size-6 text-type-caption-1 font-semibold",
    crumb: "size-4.5 text-type-caption-2 font-medium",
    list: "size-5 text-type-caption-1 font-medium",
    row: "size-6 text-type-body-large font-medium",
  }[size];
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
        "flex shrink-0 items-center justify-center rounded-xsm",
        box,
        !color && "bg-foreground-03",
        // The letter follows the brand colour, not the theme: a cream brand needs a dark letter
        // in dark mode too.
        readableOn(color) === "light" ? "text-on-dark" : "text-on-light",
      )}
    >
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}
