"use client";

import { ShimmerText } from "@/components/ui/shimmer-loader";
import { MorphText } from "@/components/ui/text-morph";
import { cn } from "@/lib/utils";

/**
 * The status line's words: when they change, the letters both labels share glide into place and
 * numbers roll by place value (torph), so "Working on it… 3s" ticks only its seconds and
 * "Working on it…" morphs into "Completed 4 steps"; while Lander works a light sweeps over them
 * (AffectUI's Thinking Loader). One row high, so nothing below moves as the words change.
 */
export function RollingLabel({
  label,
  working,
  className,
}: {
  label: string;
  working: boolean;
  className?: string;
}) {
  return (
    <span className={cn("relative inline-flex min-w-0", className)}>
      <ShimmerText active={working} mode="mask">
        <MorphText className="whitespace-nowrap">{label}</MorphText>
      </ShimmerText>
    </span>
  );
}
