import {
  type Icon,
  StatusApprovedIcon,
  StatusBuildingIcon,
  StatusFailedIcon,
  StatusPublishedIcon,
  StatusReviewIcon,
} from "@/components/ui/icons";
import { cn } from "@/lib/utils";

export type StatusGlyphKind =
  "building" | "needs_review" | "approved" | "published" | "failed";

const GLYPHS: Record<StatusGlyphKind, { icon: Icon; className: string }> = {
  building: { icon: StatusBuildingIcon, className: "text-sub-text" },
  needs_review: { icon: StatusReviewIcon, className: "text-spot-500-yellow" },
  approved: { icon: StatusApprovedIcon, className: "text-spot-500-indigo" },
  published: { icon: StatusPublishedIcon, className: "text-spot-500-green" },
  failed: { icon: StatusFailedIcon, className: "text-spot-500-red" },
};

/**
 * Status icon for group headers: dashed circle, circle, half-filled, check, cross. Decorative:
 * always place it next to a text label, so status is never shown by colour alone.
 */
export function StatusGlyph({ status }: { status: StatusGlyphKind }) {
  const { icon: GlyphIcon, className } = GLYPHS[status];
  return <GlyphIcon aria-hidden className={cn("size-4 shrink-0", className)} />;
}
