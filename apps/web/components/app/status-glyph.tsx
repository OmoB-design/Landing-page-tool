import type { ComponentType, SVGProps } from "react";

import {
  StatusApprovedFigmaIcon,
  StatusBuildingFigmaIcon,
  StatusFailedFigmaIcon,
  StatusPublishedFigmaIcon,
  StatusRingIcon,
} from "@/components/ui/lp-icons";
import { cn } from "@/lib/utils";

export type StatusGlyphKind =
  "building" | "needs_review" | "approved" | "published" | "failed";

// Figma: All Pages/states light and state dark. Each state's icon in its token colour; the
// approved icon is 18 px and sits centred in the same 20 px box as the others.
const GLYPHS: Record<
  StatusGlyphKind,
  { icon: ComponentType<SVGProps<SVGSVGElement>>; className: string }
> = {
  needs_review: { icon: StatusRingIcon, className: "text-spot-500-blue" },
  building: {
    icon: StatusBuildingFigmaIcon,
    className: "text-icon-nav-active",
  },
  published: {
    icon: StatusPublishedFigmaIcon,
    className: "text-spot-500-green",
  },
  approved: {
    icon: StatusApprovedFigmaIcon,
    className: "text-spot-500-purple",
  },
  failed: { icon: StatusFailedFigmaIcon, className: "text-spot-500-red" },
};

/** Published's check at 14 px in a box that hugs it, so its name sits 4 px away (the Library and
 * Analytics, owner 2026-10-30). Spread into StatusGlyph. */
export const PUBLISHED_14 = {
  className: "size-3.5",
  iconClassName: "size-3.5",
} as const;

/**
 * Status icon for group headers, 20 px. Decorative: always place it next to a text label, so
 * status is never shown by colour alone. `className` resizes the box and `iconClassName` the icon
 * (the Library and Analytics draw Published at 14 px in a box that hugs it, owner 2026-10-30).
 */
export function StatusGlyph({
  status,
  className: boxClassName,
  iconClassName,
}: {
  status: StatusGlyphKind;
  className?: string;
  iconClassName?: string;
}) {
  const { icon: GlyphIcon, className } = GLYPHS[status];
  return (
    <span
      aria-hidden
      data-status={status}
      className={cn(
        "flex size-5 shrink-0 items-center justify-center",
        className,
        boxClassName,
      )}
    >
      <GlyphIcon className={iconClassName} />
    </span>
  );
}
