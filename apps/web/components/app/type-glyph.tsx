import type { ComponentType, SVGProps } from "react";

import {
  TypeAdvertorialFigmaIcon,
  TypeComparisonFigmaIcon,
  TypeListicleFigmaIcon,
  TypeLongFormFigmaIcon,
  TypeOtherFigmaIcon,
  TypeVersusFigmaIcon,
} from "@/components/ui/lp-icons";
import { cn } from "@/lib/utils";

type GlyphStyle = {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
  className: string;
};

// Every type follows Figma (All Pages and its states frames): its icon, at its own 11–16 px
// size, on a tint. Where the light and dark frames differ, the dark: classes follow the dark one.

const GLYPHS: Record<string, GlyphStyle> = {
  advertorial: {
    icon: TypeAdvertorialFigmaIcon,
    label: "Advertorial",
    className: "bg-highlight-yellow-150 text-template-advertorial",
  },
  listicle: {
    icon: TypeListicleFigmaIcon,
    label: "Listicle",
    className: "bg-highlight-purple-50 text-spot-500-indigo",
  },
  versus: {
    icon: TypeVersusFigmaIcon,
    label: "Versus",
    className: "bg-tint-red text-spot-500-red",
  },
  comparison: {
    icon: TypeComparisonFigmaIcon,
    label: "Comparison",
    className: "bg-tint-green text-highlight-green-500",
  },
  long_form: {
    icon: TypeLongFormFigmaIcon,
    label: "Long form",
    className: "bg-tint-blue text-spot-500-blue",
  },
};

/** "long_form" → "Long form"; unknown types (quiz_bridge, product_page …) are humanised. */
export function templateTypeLabel(type: string): string {
  const known = GLYPHS[type];
  if (known) return known.label;
  const words = type.replaceAll("_", " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : "Other";
}

/**
 * The template type as a coloured glyph in a tinted square (DESIGN.md §2). `md` is the Pages
 * row size (Figma: 23 x 24 with 4 px corners); `card` the template cards' (Figma: the same
 * glyph at 87 %, 20 x 21); `sm` the 20 px square used in steps.
 */
export function TypeGlyph({
  type,
  size = "sm",
}: {
  type: string;
  size?: "sm" | "md" | "card";
}) {
  const glyph = GLYPHS[type];
  const GlyphIcon = glyph?.icon ?? TypeOtherFigmaIcon;
  const label = templateTypeLabel(type);
  return (
    <span
      title={label}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-xsm",
        size === "md"
          ? "h-6 w-5.75"
          : size === "card"
            ? "h-5.25 w-5 [&_svg]:scale-87"
            : "size-5",
        glyph?.className ??
          "bg-foreground-01 text-heading-01 dark:bg-foreground-02 dark:text-icon-system",
      )}
    >
      <GlyphIcon aria-hidden />
      <span className="sr-only">{label}</span>
    </span>
  );
}
