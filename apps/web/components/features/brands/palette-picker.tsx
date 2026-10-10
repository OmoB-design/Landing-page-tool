"use client";

import { SmartRecommendation } from "@/components/ui/smart-recommendation";
import type { BrandDraft } from "@/lib/validators/brand";

/**
 * The fetched colour candidates as an AffectUI smart recommendation: the best guess first with
 * how sure we are, alternatives one click away. Accepting sets the brand's primary colour.
 */
export function PalettePicker({
  candidates,
  onChoose,
}: {
  candidates: BrandDraft["palette_candidates"];
  onChoose: (hex: string) => void;
}) {
  if (candidates.length === 0) return null;
  return (
    <SmartRecommendation
      title="Brand colour"
      options={candidates.map((candidate) => ({
        id: candidate.hex,
        label: candidate.label,
        signal: Math.min(3, Math.max(0, candidate.signal)) as 0 | 1 | 2 | 3,
        reason: (
          <span className="flex items-center gap-2">
            <span
              aria-hidden
              style={{ backgroundColor: candidate.hex }}
              className="size-4 shrink-0 rounded-xsm border border-stroke"
            />
            <span>Found as: {candidate.reason}.</span>
          </span>
        ),
      }))}
      onAccept={(option) => onChoose(option.id)}
    />
  );
}
