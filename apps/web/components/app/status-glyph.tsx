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
  building: { icon: StatusBuildingIcon, className: "text-fg-muted" },
  needs_review: { icon: StatusReviewIcon, className: "text-warning" },
  approved: { icon: StatusApprovedIcon, className: "text-accent" },
  published: { icon: StatusPublishedIcon, className: "text-success" },
  failed: { icon: StatusFailedIcon, className: "text-danger" },
};

/**
 * Status icon for group headers: dashed circle, circle, half-filled, check, cross. Decorative:
 * always place it next to a text label, so status is never shown by colour alone.
 */
export function StatusGlyph({ status }: { status: StatusGlyphKind }) {
  const { icon: GlyphIcon, className } = GLYPHS[status];
  return <GlyphIcon aria-hidden className={cn("size-4 shrink-0", className)} />;
}
