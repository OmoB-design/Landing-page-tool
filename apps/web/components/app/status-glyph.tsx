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

/**
 * Status icon for group headers, 20 px. Decorative: always place it next to a text label, so
 * status is never shown by colour alone.
 */
export function StatusGlyph({ status }: { status: StatusGlyphKind }) {
  const { icon: GlyphIcon, className } = GLYPHS[status];
  return (
    <span
      aria-hidden
      data-status={status}
      className={cn(
        "flex size-5 shrink-0 items-center justify-center",
        className,
      )}
    >
      <GlyphIcon />
    </span>
  );
}
