import {
  type Icon,
  TypeAdvertorialIcon,
  TypeComparisonIcon,
  TypeListicleIcon,
  TypeLongFormIcon,
  TypeOtherIcon,
  TypeVersusIcon,
} from "@/components/ui/icons";
import { cn } from "@/lib/utils";

type GlyphStyle = { icon: Icon; label: string; className: string };

const GLYPHS: Record<string, GlyphStyle> = {
  advertorial: {
    icon: TypeAdvertorialIcon,
    label: "Advertorial",
    className: "bg-glyph-advertorial/15 text-glyph-advertorial",
  },
  listicle: {
    icon: TypeListicleIcon,
    label: "Listicle",
    className: "bg-glyph-listicle/15 text-glyph-listicle",
  },
  versus: {
    icon: TypeVersusIcon,
    label: "Versus",
    className: "bg-glyph-versus/15 text-glyph-versus",
  },
  comparison: {
    icon: TypeComparisonIcon,
    label: "Comparison",
    className: "bg-glyph-comparison/15 text-glyph-comparison",
  },
  long_form: {
    icon: TypeLongFormIcon,
    label: "Long form",
    className: "bg-glyph-longform/15 text-glyph-longform",
  },
};

/** "long_form" → "Long form"; unknown types (quiz_bridge, product_page …) are humanised. */
export function templateTypeLabel(type: string): string {
  const known = GLYPHS[type];
  if (known) return known.label;
  const words = type.replaceAll("_", " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : "Other";
}

/** The template type as a coloured glyph in a tinted square (DESIGN.md §2). */
export function TypeGlyph({ type }: { type: string }) {
  const glyph = GLYPHS[type];
  const GlyphIcon = glyph?.icon ?? TypeOtherIcon;
  const label = templateTypeLabel(type);
  return (
    <span
      title={label}
      className={cn(
        "flex size-5 shrink-0 items-center justify-center rounded-xs",
        glyph?.className ?? "bg-surface-muted text-fg-muted",
      )}
    >
      <GlyphIcon aria-hidden className="size-3.5" />
      <span className="sr-only">{label}</span>
    </span>
  );
}
